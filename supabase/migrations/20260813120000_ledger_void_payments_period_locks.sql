-- Bookkeeping integrity: no hard-delete of booked entries, reversals,
-- audit log, payment events, and period locks.

-- ---------------------------------------------------------------------------
-- Columns on finance_entries
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS posting_kind text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS booking_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reverses_entry_id uuid REFERENCES public.finance_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_by_entry_id uuid REFERENCES public.finance_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS correction_of_entry_id uuid REFERENCES public.finance_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS private_expense boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS period_lock_exception_id uuid;

ALTER TABLE public.finance_entries
  DROP CONSTRAINT IF EXISTS finance_entries_posting_kind_check;
ALTER TABLE public.finance_entries
  ADD CONSTRAINT finance_entries_posting_kind_check
  CHECK (posting_kind IN ('original', 'reversal', 'correction'));

ALTER TABLE public.finance_entries
  DROP CONSTRAINT IF EXISTS finance_entries_booking_status_check;
ALTER TABLE public.finance_entries
  ADD CONSTRAINT finance_entries_booking_status_check
  CHECK (booking_status IN ('active', 'voided', 'corrected'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_entries_one_reversal
  ON public.finance_entries (reverses_entry_id)
  WHERE posting_kind = 'reversal' AND reverses_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entries_booking_status
  ON public.finance_entries (organization_id, booking_status);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_entry_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.finance_entries(id) ON DELETE CASCADE,
  action text NOT NULL,
  field_name text,
  old_value text,
  new_value text,
  reason text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_entry_audit_action_check
    CHECK (action IN (
      'metadata', 'void', 'correct', 'payment', 'private',
      'period_lock', 'period_unlock', 'admin_exception'
    ))
);
CREATE INDEX IF NOT EXISTS idx_entry_audit_entry ON public.finance_entry_audit(entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entry_audit_org ON public.finance_entry_audit(organization_id, created_at DESC);

GRANT SELECT, INSERT ON public.finance_entry_audit TO authenticated;
GRANT ALL ON public.finance_entry_audit TO service_role;
ALTER TABLE public.finance_entry_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view entry audit" ON public.finance_entry_audit;
CREATE POLICY "Members view entry audit"
  ON public.finance_entry_audit FOR SELECT TO authenticated
  USING (app_private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Editors+ insert entry audit" ON public.finance_entry_audit;
CREATE POLICY "Editors+ insert entry audit"
  ON public.finance_entry_audit FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]));

-- ---------------------------------------------------------------------------
-- Payment events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.finance_entries(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'payment',
  amount numeric(14,2) NOT NULL,
  paid_on date NOT NULL,
  paid_by text,
  notes text,
  bank_transaction_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_payments_kind_check
    CHECK (kind IN ('payment', 'refund', 'credit_note')),
  CONSTRAINT finance_payments_amount_check
    CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_payments_entry ON public.finance_payments(entry_id, paid_on);
CREATE INDEX IF NOT EXISTS idx_payments_org ON public.finance_payments(organization_id, paid_on);

GRANT SELECT, INSERT ON public.finance_payments TO authenticated;
GRANT ALL ON public.finance_payments TO service_role;
ALTER TABLE public.finance_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view payments" ON public.finance_payments;
CREATE POLICY "Members view payments"
  ON public.finance_payments FOR SELECT TO authenticated
  USING (app_private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Editors+ insert payments" ON public.finance_payments;
CREATE POLICY "Editors+ insert payments"
  ON public.finance_payments FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]));

-- No UPDATE/DELETE policies: payment events are append-only.

-- ---------------------------------------------------------------------------
-- Period locks + admin exceptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_year int NOT NULL,
  period_month int NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by uuid,
  reason text,
  CONSTRAINT finance_period_locks_month_check CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT finance_period_locks_unique UNIQUE (organization_id, period_year, period_month)
);

GRANT SELECT, INSERT, DELETE ON public.finance_period_locks TO authenticated;
GRANT ALL ON public.finance_period_locks TO service_role;
ALTER TABLE public.finance_period_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view period locks" ON public.finance_period_locks;
CREATE POLICY "Members view period locks"
  ON public.finance_period_locks FOR SELECT TO authenticated
  USING (app_private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Admins+ insert period locks" ON public.finance_period_locks;
CREATE POLICY "Admins+ insert period locks"
  ON public.finance_period_locks FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Admins+ delete period locks" ON public.finance_period_locks;
CREATE POLICY "Admins+ delete period locks"
  ON public.finance_period_locks FOR DELETE TO authenticated
  USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

CREATE TABLE IF NOT EXISTS public.finance_admin_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  reason text NOT NULL,
  period_year int,
  period_month int,
  entry_id uuid REFERENCES public.finance_entries(id) ON DELETE SET NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_exceptions_org ON public.finance_admin_exceptions(organization_id, created_at DESC);

GRANT SELECT, INSERT ON public.finance_admin_exceptions TO authenticated;
GRANT ALL ON public.finance_admin_exceptions TO service_role;
ALTER TABLE public.finance_admin_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view admin exceptions" ON public.finance_admin_exceptions;
CREATE POLICY "Members view admin exceptions"
  ON public.finance_admin_exceptions FOR SELECT TO authenticated
  USING (app_private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Admins+ insert admin exceptions" ON public.finance_admin_exceptions;
CREATE POLICY "Admins+ insert admin exceptions"
  ON public.finance_admin_exceptions FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

ALTER TABLE public.finance_entries
  DROP CONSTRAINT IF EXISTS finance_entries_period_lock_exception_fkey;
ALTER TABLE public.finance_entries
  ADD CONSTRAINT finance_entries_period_lock_exception_fkey
  FOREIGN KEY (period_lock_exception_id) REFERENCES public.finance_admin_exceptions(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.period_is_locked(_org uuid, _date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.finance_period_locks
    WHERE organization_id = _org
      AND period_year = EXTRACT(YEAR FROM _date)::int
      AND period_month = EXTRACT(MONTH FROM _date)::int
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_entry_payment_status(_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  e record;
  net_paid numeric(14,2);
  last_full_date date;
  new_status public.payment_status;
  new_paid_at date;
  open_amt numeric(14,2);
BEGIN
  SELECT id, amount_gross, posting_kind, booking_status
    INTO e
  FROM public.finance_entries
  WHERE id = _entry_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF e.posting_kind <> 'original' OR e.booking_status <> 'active' THEN
    RETURN;
  END IF;

  open_amt := ABS(e.amount_gross);

  SELECT COALESCE(SUM(
    CASE
      WHEN kind = 'payment' THEN amount
      ELSE -amount
    END
  ), 0)
    INTO net_paid
  FROM public.finance_payments
  WHERE entry_id = _entry_id;

  IF net_paid <= 0 THEN
    new_status := 'unpaid';
    new_paid_at := NULL;
  ELSIF net_paid + 0.005 < open_amt THEN
    new_status := 'partial';
    new_paid_at := NULL;
  ELSE
    new_status := 'paid';
    SELECT MIN(running.paid_on) INTO last_full_date
    FROM (
      SELECT p.paid_on,
             SUM(CASE WHEN p.kind = 'payment' THEN p.amount ELSE -p.amount END)
               OVER (ORDER BY p.paid_on, p.created_at) AS cum
      FROM public.finance_payments p
      WHERE p.entry_id = _entry_id
    ) running
    WHERE running.cum + 0.005 >= open_amt;
    new_paid_at := last_full_date;
  END IF;

  UPDATE public.finance_entries
     SET payment_status = new_status,
         paid_at = new_paid_at
   WHERE id = _entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_payments_refresh_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_entry_payment_status(NEW.entry_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_refresh_status ON public.finance_payments;
CREATE TRIGGER trg_payments_refresh_status
AFTER INSERT ON public.finance_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_payments_refresh_status();

-- Block overpayment (payments only; refunds/credit notes reduce net)
CREATE OR REPLACE FUNCTION public.trg_payments_no_overpay()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  e record;
  net_paid numeric(14,2);
  open_amt numeric(14,2);
  delta numeric(14,2);
BEGIN
  SELECT amount_gross, posting_kind, booking_status
    INTO e
  FROM public.finance_entries
  WHERE id = NEW.entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posten finnes ikke';
  END IF;
  IF e.posting_kind <> 'original' OR e.booking_status <> 'active' THEN
    RAISE EXCEPTION 'Betaling kan bare registreres på aktive originalposter';
  END IF;

  open_amt := ABS(e.amount_gross);
  SELECT COALESCE(SUM(
    CASE WHEN kind = 'payment' THEN amount ELSE -amount END
  ), 0)
    INTO net_paid
  FROM public.finance_payments
  WHERE entry_id = NEW.entry_id;

  delta := CASE WHEN NEW.kind = 'payment' THEN NEW.amount ELSE -NEW.amount END;

  IF NEW.kind = 'payment' AND net_paid + delta > open_amt + 0.005 THEN
    RAISE EXCEPTION 'Betalingen overstiger åpent beløp (%). Registrer kreditnota/refusjon eksplisitt.', open_amt - net_paid;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_no_overpay ON public.finance_payments;
CREATE TRIGGER trg_payments_no_overpay
BEFORE INSERT ON public.finance_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_payments_no_overpay();

-- ---------------------------------------------------------------------------
-- Immutability: booked entries cannot be hard-deleted; amounts cannot change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_entries_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Bokførte poster kan ikke slettes. Bruk annullering med motpost.';
END;
$$;

DROP TRIGGER IF EXISTS trg_entries_no_delete ON public.finance_entries;
CREATE TRIGGER trg_entries_no_delete
BEFORE DELETE ON public.finance_entries
FOR EACH ROW EXECUTE FUNCTION public.trg_entries_no_delete();

DROP POLICY IF EXISTS "Admins+ delete entries" ON public.finance_entries;

CREATE OR REPLACE FUNCTION public.trg_entries_protect_amounts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.amount_gross IS DISTINCT FROM OLD.amount_gross
     OR NEW.amount_net IS DISTINCT FROM OLD.amount_net
     OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
     OR NEW.vat_rate IS DISTINCT FROM OLD.vat_rate
     OR NEW.entry_type IS DISTINCT FROM OLD.entry_type
     OR NEW.voucher_number IS DISTINCT FROM OLD.voucher_number
     OR NEW.book_id IS DISTINCT FROM OLD.book_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Beløp, type og bilagsnummer kan ikke endres. Bruk korrigering eller annullering.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entries_protect_amounts ON public.finance_entries;
CREATE TRIGGER trg_entries_protect_amounts
BEFORE UPDATE ON public.finance_entries
FOR EACH ROW EXECUTE FUNCTION public.trg_entries_protect_amounts();

CREATE OR REPLACE FUNCTION public.trg_entries_period_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.period_is_locked(NEW.organization_id, NEW.entry_date)
     AND NEW.period_lock_exception_id IS NULL THEN
    RAISE EXCEPTION 'Perioden %-% er låst. Poster korreksjoner i neste åpne periode, eller logg et admin-unntak.',
      EXTRACT(YEAR FROM NEW.entry_date)::int,
      EXTRACT(MONTH FROM NEW.entry_date)::int;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entries_period_lock ON public.finance_entries;
CREATE TRIGGER trg_entries_period_lock
BEFORE INSERT ON public.finance_entries
FOR EACH ROW EXECUTE FUNCTION public.trg_entries_period_lock();

-- Metadata audit (category / description / notes / private flag)
CREATE OR REPLACE FUNCTION public.trg_entries_metadata_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO public.finance_entry_audit (organization_id, entry_id, action, field_name, old_value, new_value, actor_id)
    VALUES (NEW.organization_id, NEW.id, 'metadata', 'description', OLD.description, NEW.description, auth.uid());
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    INSERT INTO public.finance_entry_audit (organization_id, entry_id, action, field_name, old_value, new_value, actor_id)
    VALUES (NEW.organization_id, NEW.id, 'metadata', 'category', OLD.category, NEW.category, auth.uid());
  END IF;
  IF NEW.category_group IS DISTINCT FROM OLD.category_group THEN
    INSERT INTO public.finance_entry_audit (organization_id, entry_id, action, field_name, old_value, new_value, actor_id)
    VALUES (NEW.organization_id, NEW.id, 'metadata', 'category_group', OLD.category_group, NEW.category_group, auth.uid());
  END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    INSERT INTO public.finance_entry_audit (organization_id, entry_id, action, field_name, old_value, new_value, actor_id)
    VALUES (NEW.organization_id, NEW.id, 'metadata', 'notes', OLD.notes, NEW.notes, auth.uid());
  END IF;
  IF NEW.counterparty IS DISTINCT FROM OLD.counterparty THEN
    INSERT INTO public.finance_entry_audit (organization_id, entry_id, action, field_name, old_value, new_value, actor_id)
    VALUES (NEW.organization_id, NEW.id, 'metadata', 'counterparty', OLD.counterparty, NEW.counterparty, auth.uid());
  END IF;
  IF NEW.private_expense IS DISTINCT FROM OLD.private_expense THEN
    INSERT INTO public.finance_entry_audit (organization_id, entry_id, action, field_name, old_value, new_value, actor_id)
    VALUES (NEW.organization_id, NEW.id, 'private', 'private_expense', OLD.private_expense::text, NEW.private_expense::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entries_metadata_audit ON public.finance_entries;
CREATE TRIGGER trg_entries_metadata_audit
AFTER UPDATE ON public.finance_entries
FOR EACH ROW EXECUTE FUNCTION public.trg_entries_metadata_audit();

GRANT EXECUTE ON FUNCTION public.period_is_locked(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_entry_payment_status(uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.finance_entries.posting_kind IS
  'original | reversal | correction. Amounts on originals are immutable.';
COMMENT ON COLUMN public.finance_entries.booking_status IS
  'active | voided | corrected. Voided originals keep original amounts.';
COMMENT ON COLUMN public.finance_entries.private_expense IS
  'True when the purchase is private / not deductible for the company.';
