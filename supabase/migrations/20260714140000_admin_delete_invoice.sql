-- Admin-only invoice deletion (including sent duplicates).
-- Used by service_role / admin_delete_invoice RPC for data cleanup.

CREATE OR REPLACE FUNCTION public.admin_delete_invoice(
  p_organization_id uuid,
  p_invoice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  entry_id uuid;
  att_id uuid;
BEGIN
  SELECT *
  INTO inv
  FROM public.invoices
  WHERE id = p_invoice_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faktura ikke funnet';
  END IF;

  entry_id := inv.finance_entry_id;
  att_id := inv.pdf_attachment_id;

  ALTER TABLE public.invoices DISABLE TRIGGER p_protect_locked_invoice;
  UPDATE public.invoices
  SET finance_entry_id = NULL,
      pdf_attachment_id = NULL
  WHERE id = p_invoice_id;
  ALTER TABLE public.invoices ENABLE TRIGGER p_protect_locked_invoice;

  IF entry_id IS NOT NULL THEN
    DELETE FROM public.finance_attachments
    WHERE entry_id = entry_id
      AND organization_id = p_organization_id;
    DELETE FROM public.finance_entries
    WHERE id = entry_id
      AND organization_id = p_organization_id;
  END IF;

  IF att_id IS NOT NULL THEN
    DELETE FROM public.finance_attachments
    WHERE id = att_id
      AND organization_id = p_organization_id;
  END IF;

  ALTER TABLE public.invoices DISABLE TRIGGER trg_prevent_sent_invoice_delete;
  DELETE FROM public.invoices
  WHERE id = p_invoice_id
    AND organization_id = p_organization_id;
  ALTER TABLE public.invoices ENABLE TRIGGER trg_prevent_sent_invoice_delete;

  RETURN jsonb_build_object(
    'deleted', true,
    'invoice_id', p_invoice_id,
    'invoice_number', inv.invoice_number,
    'finance_entry_id', entry_id,
    'pdf_attachment_id', att_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_invoice(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_invoice(uuid, uuid) TO service_role;
