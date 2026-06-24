
ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS original_voucher_number text;

COMMENT ON COLUMN public.finance_entries.original_voucher_number IS
  'Voucher number prior to a cross-book/org migration. Null if never migrated.';

DO $$
DECLARE
  v_src_org  uuid := 'b816fa4e-9f17-4365-b7a5-1343317c2e25';
  v_dst_org  uuid := 'bbc194b3-3067-4eb9-9918-87bed9ab7670';
  v_src_book uuid := '210fc25c-4be7-4f06-ba3f-91dc6f56eca9';
  v_dst_book uuid := '92b66dba-45dd-4e07-a8ec-39634854a197';
  v_invoice_id uuid := '060e383a-d44f-426e-b96c-2d8daa25b816';
  v_ids uuid[] := ARRAY[
    'be3bb5fe-964b-497b-8000-b148a7b96116'::uuid,
    '706ed15c-fd48-4ea3-8985-b87cc39bc68c'::uuid,
    '5da4ad41-57a2-46f0-821b-7fee2ba42490'::uuid,
    '4e589d7d-096e-48d7-90bd-da718129e81c'::uuid,
    'c3e71305-9e0e-4201-ae4c-e7aa1f40dba2'::uuid,
    '127d5a7f-c9c9-4e07-9748-c411c07a2b01'::uuid,
    '330b8085-a14e-4cc3-b6dd-dadd8e4a0119'::uuid
  ];
  r RECORD;
  v_seq integer;
  v_new_voucher text;
  v_moved_entries int := 0;
  v_moved_attachments int := 0;
  v_moved_drafts int := 0;
  v_moved_invoices int := 0;
  v_moved_lines int := 0;
  v_total_expense numeric := 0;
  v_total_income numeric := 0;
BEGIN
  SELECT voucher_seq INTO v_seq FROM public.finance_books
   WHERE id = v_dst_book FOR UPDATE;

  FOR r IN
    SELECT id, entry_date, entry_type, amount_gross, voucher_number, description
      FROM public.finance_entries
     WHERE id = ANY(v_ids)
       AND organization_id = v_src_org
       AND book_id = v_src_book
     ORDER BY entry_date, id
  LOOP
    v_seq := v_seq + 1;
    v_new_voucher := EXTRACT(YEAR FROM r.entry_date)::text || '-' || lpad(v_seq::text, 4, '0');

    UPDATE public.finance_entries
       SET organization_id          = v_dst_org,
           book_id                  = v_dst_book,
           pre_company_expense      = true,
           original_voucher_number  = r.voucher_number,
           voucher_number           = v_new_voucher,
           updated_at               = now()
     WHERE id = r.id;

    RAISE NOTICE 'Moved entry % | % | % NOK | voucher % → % | %',
      r.id, r.entry_date, r.amount_gross, r.voucher_number, v_new_voucher, r.description;

    v_moved_entries := v_moved_entries + 1;
    IF r.entry_type = 'income' THEN
      v_total_income := v_total_income + r.amount_gross;
    ELSE
      v_total_expense := v_total_expense + r.amount_gross;
    END IF;
  END LOOP;

  UPDATE public.finance_books SET voucher_seq = v_seq WHERE id = v_dst_book;

  WITH upd AS (
    UPDATE public.finance_attachments
       SET organization_id = v_dst_org
     WHERE organization_id = v_src_org
       AND entry_id = ANY(v_ids)
     RETURNING 1
  )
  SELECT count(*) INTO v_moved_attachments FROM upd;

  WITH upd AS (
    UPDATE public.finance_receipt_drafts
       SET organization_id = v_dst_org, updated_at = now()
     WHERE id = '9decde95-f379-4cc8-9da5-1109cd91899c'
       AND organization_id = v_src_org
     RETURNING 1
  )
  SELECT count(*) INTO v_moved_drafts FROM upd;

  PERFORM 1 FROM public.invoices WHERE id = v_invoice_id AND organization_id = v_src_org;
  IF FOUND THEN
    ALTER TABLE public.invoices DISABLE TRIGGER USER;
    UPDATE public.invoices
       SET organization_id = v_dst_org, updated_at = now()
     WHERE id = v_invoice_id;
    ALTER TABLE public.invoices ENABLE TRIGGER USER;
    v_moved_invoices := 1;
    SELECT count(*) INTO v_moved_lines FROM public.invoice_lines WHERE invoice_id = v_invoice_id;
  END IF;

  UPDATE public.organizations
     SET invoice_seq      = GREATEST(COALESCE(invoice_seq, 0), 1),
         invoice_seq_year = 2026,
         updated_at       = now()
   WHERE id = v_dst_org;

  RAISE NOTICE '--- Migration summary ---';
  RAISE NOTICE 'Entries moved:   %', v_moved_entries;
  RAISE NOTICE 'Total expense:   % NOK', v_total_expense;
  RAISE NOTICE 'Total income:    % NOK', v_total_income;
  RAISE NOTICE 'Attachments:     %', v_moved_attachments;
  RAISE NOTICE 'Receipt drafts:  %', v_moved_drafts;
  RAISE NOTICE 'Invoices/lines:  % / %', v_moved_invoices, v_moved_lines;
  RAISE NOTICE 'GoS voucher_seq: %', v_seq;

  IF v_moved_entries <> 7 THEN
    RAISE EXCEPTION 'Expected 7 entries moved, got %', v_moved_entries;
  END IF;
END $$;
