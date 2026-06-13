-- ============================================================================
-- API SCOPES
-- ============================================================================
ALTER TYPE public.api_scope ADD VALUE IF NOT EXISTS 'invoices:read';
ALTER TYPE public.api_scope ADD VALUE IF NOT EXISTS 'invoices:write';

-- ============================================================================
-- ORGANIZATION SELLER FIELDS + INVOICE SEQUENCE
-- ============================================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Norge',
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS invoice_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_seq_year integer;

-- ============================================================================
-- INVOICES (reuses existing public.invoice_status enum)
-- Note: existing enum has values 'none','draft','sent','overdue','paid' —
-- we use 'draft','sent','paid' for this domain.
-- ============================================================================
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  invoice_number text,
  status public.invoice_status NOT NULL DEFAULT 'draft',

  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,

  customer_name text NOT NULL,
  customer_org_number text,
  customer_email text,
  customer_address text,

  seller_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,

  pdf_attachment_id uuid REFERENCES public.finance_attachments(id) ON DELETE RESTRICT,

  locked_at timestamptz,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invoices_valid_status CHECK (status IN ('draft','sent','paid')),
  CONSTRAINT invoices_number_required_when_sent
    CHECK (status = 'draft' OR invoice_number IS NOT NULL),
  CONSTRAINT invoices_locked_when_sent
    CHECK (status = 'draft' OR locked_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_invoices_org_number
  ON public.invoices (organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE INDEX idx_invoices_org ON public.invoices (organization_id);
CREATE INDEX idx_invoices_status ON public.invoices (organization_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Editors+ insert invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[]));

CREATE POLICY "Editors+ update draft invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[])
    AND locked_at IS NULL
  )
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[])
    AND locked_at IS NULL
  );

CREATE POLICY "Admins+ delete draft invoices"
  ON public.invoices FOR DELETE TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
    AND status = 'draft'
    AND locked_at IS NULL
  );

-- ============================================================================
-- INVOICE LINES
-- ============================================================================
CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL,
  vat_rate numeric(5,2) NOT NULL DEFAULT 25,
  line_net numeric(14,2) NOT NULL,
  line_vat numeric(14,2) NOT NULL,
  line_total numeric(14,2) NOT NULL
);

CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines (invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view invoice lines"
  ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND public.is_org_member(i.organization_id, auth.uid())
  ));

CREATE POLICY "Editors+ manage draft invoice lines"
  ON public.invoice_lines FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND i.locked_at IS NULL
      AND public.has_org_role(i.organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND i.locked_at IS NULL
      AND public.has_org_role(i.organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[])
  ));

-- ============================================================================
-- ASSIGN INVOICE NUMBER ON SEND
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr integer;
  next_seq integer;
BEGIN
  IF NEW.status = 'sent' AND OLD.status = 'draft' AND NEW.invoice_number IS NULL THEN
    yr := EXTRACT(YEAR FROM NEW.issue_date)::int;

    UPDATE public.organizations
    SET
      invoice_seq = CASE
        WHEN invoice_seq_year IS DISTINCT FROM yr THEN 1
        ELSE invoice_seq + 1
      END,
      invoice_seq_year = yr
    WHERE id = NEW.organization_id
    RETURNING invoice_seq INTO next_seq;

    NEW.invoice_number := yr::text || '-' || lpad(next_seq::text, 4, '0');
    NEW.locked_at := COALESCE(NEW.locked_at, now());
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_invoice_number() TO service_role;

-- Trigger name chosen to fire BEFORE protect (alphabetic order: a < p).
CREATE TRIGGER a_assign_invoice_number
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_invoice_number();

-- ============================================================================
-- LOCK PROTECTION (runs after assign)
-- Allows status and pdf_attachment_id changes post-lock; freezes everything else.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_locked_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.locked_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Status can transition sent -> paid (or stay)
  IF NEW.status NOT IN ('sent','paid') THEN
    RAISE EXCEPTION 'Locked invoices can only have status sent or paid';
  END IF;

  -- Immutable fields after lock
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
$$;

CREATE TRIGGER p_protect_locked_invoice
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_locked_invoice();

CREATE OR REPLACE FUNCTION public.protect_locked_invoice_lines()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  inv_locked timestamptz;
BEGIN
  SELECT locked_at INTO inv_locked
  FROM public.invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  IF inv_locked IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice lines are locked';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_invoice_lines_insert
  BEFORE INSERT ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_invoice_lines();

CREATE TRIGGER trg_protect_invoice_lines_update
  BEFORE UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_invoice_lines();

CREATE TRIGGER trg_protect_invoice_lines_delete
  BEFORE DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_invoice_lines();

CREATE OR REPLACE FUNCTION public.prevent_sent_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'draft' OR OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Sent invoices cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_sent_invoice_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_sent_invoice_delete();

CREATE TRIGGER trg_invoices_touch
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
