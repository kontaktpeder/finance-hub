CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_books TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.finance_books TO service_role;

CREATE OR REPLACE FUNCTION app_private.is_org_member(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION app_private.has_org_role(_org uuid, _user uuid, _roles public.org_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
      AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION app_private.org_role_of(_org uuid, _user uuid)
RETURNS public.org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE organization_id = _org
    AND user_id = _user
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_org_role(uuid, uuid, public.org_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.org_role_of(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_creator_as_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_voucher_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_add_creator_as_owner ON public.organizations;
CREATE TRIGGER trg_add_creator_as_owner
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.add_creator_as_owner();

DROP TRIGGER IF EXISTS trg_touch_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_touch_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_finance_books_updated_at ON public.finance_books;
CREATE TRIGGER trg_touch_finance_books_updated_at
BEFORE UPDATE ON public.finance_books
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_assign_voucher_number ON public.finance_entries;
CREATE TRIGGER trg_assign_voucher_number
BEFORE INSERT ON public.finance_entries
FOR EACH ROW
EXECUTE FUNCTION public.assign_voucher_number();

DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members and creators can view their organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (created_by = auth.uid() OR app_private.is_org_member(id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());