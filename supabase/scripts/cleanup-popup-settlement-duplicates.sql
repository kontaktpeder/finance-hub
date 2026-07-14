-- Cleanup: remove legacy popup_settlement entries now covered by Finance Core invoices.
-- Run in Supabase SQL Editor (Finance Core project: gbrcacydyqyudfrgyiri).
--
-- Safe workflow:
--   1. Run the PREVIEW block and verify rows.
--   2. Run the DELETE block in the same transaction.

-- ── 1. PREVIEW ────────────────────────────────────────────────────────────────

-- All legacy popup settlements from gold-of-sicily
SELECT
  e.id,
  e.voucher_number,
  e.entry_date,
  e.counterparty,
  e.description,
  e.amount_gross,
  e.source_app,
  e.source_type,
  e.source_ref,
  e.payment_status,
  o.name AS organization_name
FROM public.finance_entries e
JOIN public.organizations o ON o.id = e.organization_id
WHERE e.source_app = 'gold-of-sicily'
  AND e.source_type = 'popup_settlement'
ORDER BY e.entry_date, e.created_at;

-- Klink 9. juni duplicate specifically (matches bilag 2026-0008 in UI)
SELECT
  e.id,
  e.voucher_number,
  e.counterparty,
  e.amount_gross,
  e.source_ref
FROM public.finance_entries e
WHERE e.source_type = 'popup_settlement'
  AND (
    e.source_ref ILIKE '%klink%9%juni%'
    OR e.counterparty ILIKE '%klink popup 9%'
    OR e.voucher_number = '2026-0008'
  );

-- Confirm invoice entry exists for the replacement (JAJAJA / 2026-0001)
SELECT
  e.id,
  e.voucher_number,
  e.counterparty,
  e.amount_gross,
  e.source_type,
  e.source_ref,
  i.id AS invoice_id,
  i.invoice_number,
  i.status AS invoice_status
FROM public.finance_entries e
LEFT JOIN public.invoices i ON i.finance_entry_id = e.id
WHERE e.source_type = 'invoice'
  AND (e.source_ref = '2026-0001' OR i.invoice_number = '2026-0001');


-- ── 2. DELETE (run after preview looks correct) ───────────────────────────────

BEGIN;

-- Delete attachments linked to legacy popup_settlement entries
DELETE FROM public.finance_attachments fa
USING public.finance_entries e
WHERE fa.entry_id = e.id
  AND e.source_app = 'gold-of-sicily'
  AND e.source_type = 'popup_settlement';

-- Delete all legacy popup_settlement income posts (invoice flow replaces these)
DELETE FROM public.finance_entries e
WHERE e.source_app = 'gold-of-sicily'
  AND e.source_type = 'popup_settlement';

-- Optional: only the Klink 9. juni row if you prefer a narrow delete
-- DELETE FROM public.finance_attachments fa
-- USING public.finance_entries e
-- WHERE fa.entry_id = e.id
--   AND e.source_type = 'popup_settlement'
--   AND e.source_ref = 'goldofsicily-klink-popup-9-juni';
--
-- DELETE FROM public.finance_entries e
-- WHERE e.source_type = 'popup_settlement'
--   AND e.source_ref = 'goldofsicily-klink-popup-9-juni';

COMMIT;

-- ── 3. VERIFY ─────────────────────────────────────────────────────────────────

SELECT COUNT(*) AS remaining_popup_settlements
FROM public.finance_entries
WHERE source_app = 'gold-of-sicily'
  AND source_type = 'popup_settlement';

SELECT
  e.voucher_number,
  e.counterparty,
  e.amount_gross,
  e.source_type,
  e.source_ref
FROM public.finance_entries e
WHERE e.entry_type = 'income'
  AND e.counterparty ILIKE '%jajaja%'
ORDER BY e.entry_date;
