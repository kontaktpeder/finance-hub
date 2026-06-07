
-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE public.entry_type AS ENUM ('income', 'expense');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'partial', 'refunded');
CREATE TYPE public.invoice_status AS ENUM ('none', 'draft', 'sent', 'overdue', 'paid');
CREATE TYPE public.api_scope AS ENUM ('entries:read', 'entries:write', 'attachments:write', 'reports:read');

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_number text,
  kind text NOT NULL DEFAULT 'other',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORGANIZATION MEMBERS
-- ============================================================================
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.org_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECURITY DEFINER helpers (avoid RLS recursion)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION public.org_role_of(_org uuid, _user uuid)
RETURNS public.org_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = _org AND user_id = _user
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _user uuid, _roles public.org_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user AND role = ANY(_roles)
  );
$$;

-- ============================================================================
-- RLS: organizations
-- ============================================================================
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id, auth.uid()));

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins and owners can update organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Owners can delete organization"
  ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_role(id, auth.uid(), ARRAY['owner']::public.org_role[]));

-- ============================================================================
-- RLS: organization_members
-- ============================================================================
CREATE POLICY "Members can view membership of their orgs"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Admins and owners can add members"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Admins and owners can update members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Admins and owners can remove members"
  ON public.organization_members FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- Auto-add creator as owner
CREATE OR REPLACE FUNCTION public.add_creator_as_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_org_creator_owner
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_owner();

-- ============================================================================
-- FINANCE BOOKS
-- ============================================================================
CREATE TABLE public.finance_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  fiscal_year integer,
  currency text NOT NULL DEFAULT 'NOK',
  is_default boolean NOT NULL DEFAULT false,
  voucher_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_books_org ON public.finance_books(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_books TO authenticated;
GRANT ALL ON public.finance_books TO service_role;
ALTER TABLE public.finance_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view books"
  ON public.finance_books FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Editors+ create books"
  ON public.finance_books FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[]));
CREATE POLICY "Admins+ update books"
  ON public.finance_books FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Owners delete books"
  ON public.finance_books FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner']::public.org_role[]));

-- ============================================================================
-- FINANCE ENTRIES
-- ============================================================================
CREATE TABLE public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.finance_books(id) ON DELETE CASCADE,
  entry_type public.entry_type NOT NULL,
  voucher_number text,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  counterparty text,
  category text,
  category_group text,
  amount_gross numeric(14,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount_net numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NOK',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  invoice_status public.invoice_status NOT NULL DEFAULT 'none',
  paid_at date,
  due_date date,
  pre_company_expense boolean NOT NULL DEFAULT false,
  notes text,
  source_app text,
  source_type text,
  source_ref text,
  external_url text,
  created_by uuid,
  created_via text NOT NULL DEFAULT 'ui',
  api_client_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_entries_org ON public.finance_entries(organization_id);
CREATE INDEX idx_entries_book ON public.finance_entries(book_id);
CREATE INDEX idx_entries_date ON public.finance_entries(entry_date);
CREATE UNIQUE INDEX uq_entries_source
  ON public.finance_entries(organization_id, source_app, source_ref)
  WHERE source_app IS NOT NULL AND source_ref IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT ALL ON public.finance_entries TO service_role;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view entries"
  ON public.finance_entries FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Editors+ insert entries"
  ON public.finance_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[]));
CREATE POLICY "Editors+ update entries"
  ON public.finance_entries FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[]));
CREATE POLICY "Admins+ delete entries"
  ON public.finance_entries FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- Voucher number trigger (YYYY-NNNN per book)
CREATE OR REPLACE FUNCTION public.assign_voucher_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_seq integer;
  yr integer;
BEGIN
  IF NEW.voucher_number IS NOT NULL AND NEW.voucher_number <> '' THEN
    RETURN NEW;
  END IF;
  UPDATE public.finance_books
    SET voucher_seq = voucher_seq + 1
    WHERE id = NEW.book_id
    RETURNING voucher_seq INTO next_seq;
  yr := EXTRACT(YEAR FROM NEW.entry_date)::int;
  NEW.voucher_number := yr::text || '-' || lpad(next_seq::text, 4, '0');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_assign_voucher
  BEFORE INSERT ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.assign_voucher_number();

-- updated_at maintainer
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_orgs_touch BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_books_touch BEFORE UPDATE ON public.finance_books
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_entries_touch BEFORE UPDATE ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- FINANCE ATTACHMENTS
-- ============================================================================
CREATE TABLE public.finance_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.finance_entries(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_org ON public.finance_attachments(organization_id);
CREATE INDEX idx_att_entry ON public.finance_attachments(entry_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_attachments TO authenticated;
GRANT ALL ON public.finance_attachments TO service_role;
ALTER TABLE public.finance_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view attachments"
  ON public.finance_attachments FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Editors+ insert attachments"
  ON public.finance_attachments FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[]));
CREATE POLICY "Editors+ update attachments"
  ON public.finance_attachments FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[]));
CREATE POLICY "Admins+ delete attachments"
  ON public.finance_attachments FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));

-- ============================================================================
-- API CLIENTS & KEYS
-- ============================================================================
CREATE TABLE public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  allowed_scopes public.api_scope[] NOT NULL DEFAULT ARRAY['entries:read']::public.api_scope[],
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX idx_api_clients_org ON public.api_clients(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_clients TO authenticated;
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins+ view api_clients"
  ON public.api_clients FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Admins+ create api_clients"
  ON public.api_clients FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]) AND created_by = auth.uid());
CREATE POLICY "Admins+ update api_clients"
  ON public.api_clients FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Owners delete api_clients"
  ON public.api_clients FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner']::public.org_role[]));

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX idx_api_keys_client ON public.api_keys(api_client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Only allow viewing metadata (no hash exposure outside server). RLS still gates.
CREATE POLICY "Admins+ view api_keys"
  ON public.api_keys FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.api_clients c
    WHERE c.id = api_client_id
      AND public.has_org_role(c.organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  ));
CREATE POLICY "Admins+ revoke api_keys"
  ON public.api_keys FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.api_clients c
    WHERE c.id = api_client_id
      AND public.has_org_role(c.organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  ))
  WITH CHECK (true);
-- No direct insert from clients; server function handles creation via service role.

CREATE TABLE public.api_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_client_id uuid REFERENCES public.api_clients(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_events_org ON public.api_events(organization_id, created_at DESC);
GRANT SELECT ON public.api_events TO authenticated;
GRANT ALL ON public.api_events TO service_role;
ALTER TABLE public.api_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins+ view api_events"
  ON public.api_events FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[]));
