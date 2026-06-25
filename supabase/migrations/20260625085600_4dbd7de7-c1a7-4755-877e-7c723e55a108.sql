UPDATE public.finance_attachments fa
SET entry_id = i.finance_entry_id
FROM public.invoices i
WHERE fa.id = i.pdf_attachment_id
  AND i.finance_entry_id IS NOT NULL
  AND fa.entry_id IS NULL;