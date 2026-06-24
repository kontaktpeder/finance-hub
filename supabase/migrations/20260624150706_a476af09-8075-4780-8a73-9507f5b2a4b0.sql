ALTER TABLE public.finance_attachments
  ADD COLUMN IF NOT EXISTS receipt_draft_id uuid
    REFERENCES public.finance_receipt_drafts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS page_index integer;

CREATE INDEX IF NOT EXISTS idx_finance_attachments_receipt_draft
  ON public.finance_attachments (receipt_draft_id)
  WHERE receipt_draft_id IS NOT NULL;