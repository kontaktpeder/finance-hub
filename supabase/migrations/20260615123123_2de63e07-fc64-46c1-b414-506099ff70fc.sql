ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS finance_entry_id uuid REFERENCES public.finance_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoices_finance_entry
  ON public.invoices (finance_entry_id) WHERE finance_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS finance_entries_invoice_source_unique
  ON public.finance_entries (organization_id, source_app, source_type, source_ref)
  WHERE source_type = 'invoice'
    AND source_app IS NOT NULL
    AND source_ref IS NOT NULL;

-- Allow locked invoices to update paid_at and finance_entry_id when transitioning to paid.
-- Replace the protect_locked_invoice trigger function to whitelist these two fields.
CREATE OR REPLACE FUNCTION public.protect_locked_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.locked_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('sent','paid') THEN
    RAISE EXCEPTION 'Locked invoices can only have status sent or paid';
  END IF;

  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_org_number IS DISTINCT FROM OLD.customer_org_number
     OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
     OR NEW.customer_address IS DISTINCT FROM OLD.customer_address
     OR NEW.seller_snapshot IS DISTINCT FROM OLD.seller_snapshot
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
  THEN
    RAISE EXCEPTION 'Locked invoice fields cannot be modified';
  END IF;

  RETURN NEW;
END;
$function$;