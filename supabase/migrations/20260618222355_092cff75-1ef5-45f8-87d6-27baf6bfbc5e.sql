-- Ensure 'private' is allowed on organizations.kind (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_kind') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'organization_kind' AND e.enumlabel = 'private'
    ) THEN
      ALTER TYPE public.organization_kind ADD VALUE 'private';
    END IF;
  END IF;
END$$;

-- ============ bank_connections ============
CREATE TABLE public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'neonomics',
  provider_connection_id text,
  device_id uuid NOT NULL,
  bank_id text,
  bank_name text,
  status text NOT NULL DEFAULT 'pending',
  consent_expires_at timestamptz,
  last_sync_at timestamptz,
  last_sync_error text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_connections_org_idx ON public.bank_connections(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections TO authenticated;
GRANT ALL ON public.bank_connections TO service_role;

ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read bank connections"
  ON public.bank_connections FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Admins/owners can insert bank connections"
  ON public.bank_connections FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE POLICY "Admins/owners can update bank connections"
  ON public.bank_connections FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE POLICY "Admins/owners can delete bank connections"
  ON public.bank_connections FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER bank_connections_touch_updated_at
  BEFORE UPDATE ON public.bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ bank_accounts ============
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  provider_account_id text NOT NULL,
  account_name text,
  account_number text,
  currency text NOT NULL DEFAULT 'NOK',
  is_active boolean NOT NULL DEFAULT true,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_connection_id, provider_account_id)
);

CREATE INDEX bank_accounts_org_idx ON public.bank_accounts(organization_id);
CREATE INDEX bank_accounts_connection_idx ON public.bank_accounts(bank_connection_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read bank accounts"
  ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Admins/owners can insert bank accounts"
  ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE POLICY "Admins/owners can update bank accounts"
  ON public.bank_accounts FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE POLICY "Admins/owners can delete bank accounts"
  ON public.bank_accounts FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER bank_accounts_touch_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ bank_transactions ============
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  provider_transaction_id text NOT NULL,
  transaction_date date NOT NULL,
  booking_date date,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NOK',
  description text,
  counterparty text,
  is_income boolean NOT NULL,
  category text,
  finance_entry_id uuid REFERENCES public.finance_entries(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'imported',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_account_id, provider_transaction_id)
);

CREATE INDEX bank_transactions_org_idx ON public.bank_transactions(organization_id);
CREATE INDEX bank_transactions_account_date_idx ON public.bank_transactions(bank_account_id, transaction_date DESC);
CREATE INDEX bank_transactions_entry_idx ON public.bank_transactions(finance_entry_id) WHERE finance_entry_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read bank transactions"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Members can update bank transactions"
  ON public.bank_transactions FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

-- Inserts go through service_role (server sync). No INSERT/DELETE policies for authenticated.

CREATE TRIGGER bank_transactions_touch_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();