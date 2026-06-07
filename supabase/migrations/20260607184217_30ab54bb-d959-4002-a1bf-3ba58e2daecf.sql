CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.is_org_member(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION app_private.has_org_role(_org uuid, _user uuid, _roles public.org_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION app_private.org_role_of(_org uuid, _user uuid)
RETURNS public.org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = _org AND user_id = _user
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app_private.is_org_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.has_org_role(uuid, uuid, public.org_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.org_role_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.has_org_role(uuid, uuid, public.org_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.org_role_of(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (app_private.is_org_member(id, auth.uid()));

DROP POLICY IF EXISTS "Admins and owners can update organization" ON public.organizations;
CREATE POLICY "Admins and owners can update organization"
ON public.organizations
FOR UPDATE
TO authenticated
USING (app_private.has_org_role(id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]))
WITH CHECK (app_private.has_org_role(id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Owners can delete organization" ON public.organizations;
CREATE POLICY "Owners can delete organization"
ON public.organizations
FOR DELETE
TO authenticated
USING (app_private.has_org_role(id, auth.uid(), ARRAY['owner'::public.org_role]));

DROP POLICY IF EXISTS "Members can view membership of their orgs" ON public.organization_members;
CREATE POLICY "Members can view membership of their orgs"
ON public.organization_members
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Admins and owners can add members" ON public.organization_members;
CREATE POLICY "Admins and owners can add members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Admins and owners can update members" ON public.organization_members;
CREATE POLICY "Admins and owners can update members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]))
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Admins and owners can remove members" ON public.organization_members;
CREATE POLICY "Admins and owners can remove members"
ON public.organization_members
FOR DELETE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Members view books" ON public.finance_books;
CREATE POLICY "Members view books"
ON public.finance_books
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Editors+ create books" ON public.finance_books;
CREATE POLICY "Editors+ create books"
ON public.finance_books
FOR INSERT
TO authenticated
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]));

DROP POLICY IF EXISTS "Admins+ update books" ON public.finance_books;
CREATE POLICY "Admins+ update books"
ON public.finance_books
FOR UPDATE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]))
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Owners delete books" ON public.finance_books;
CREATE POLICY "Owners delete books"
ON public.finance_books
FOR DELETE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role]));

DROP POLICY IF EXISTS "Members view entries" ON public.finance_entries;
CREATE POLICY "Members view entries"
ON public.finance_entries
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Editors+ insert entries" ON public.finance_entries;
CREATE POLICY "Editors+ insert entries"
ON public.finance_entries
FOR INSERT
TO authenticated
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]));

DROP POLICY IF EXISTS "Editors+ update entries" ON public.finance_entries;
CREATE POLICY "Editors+ update entries"
ON public.finance_entries
FOR UPDATE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]))
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]));

DROP POLICY IF EXISTS "Admins+ delete entries" ON public.finance_entries;
CREATE POLICY "Admins+ delete entries"
ON public.finance_entries
FOR DELETE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Members view attachments" ON public.finance_attachments;
CREATE POLICY "Members view attachments"
ON public.finance_attachments
FOR SELECT
TO authenticated
USING (app_private.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Editors+ insert attachments" ON public.finance_attachments;
CREATE POLICY "Editors+ insert attachments"
ON public.finance_attachments
FOR INSERT
TO authenticated
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]));

DROP POLICY IF EXISTS "Editors+ update attachments" ON public.finance_attachments;
CREATE POLICY "Editors+ update attachments"
ON public.finance_attachments
FOR UPDATE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]))
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role, 'editor'::public.org_role]));

DROP POLICY IF EXISTS "Admins+ delete attachments" ON public.finance_attachments;
CREATE POLICY "Admins+ delete attachments"
ON public.finance_attachments
FOR DELETE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Admins+ view api_clients" ON public.api_clients;
CREATE POLICY "Admins+ view api_clients"
ON public.api_clients
FOR SELECT
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Admins+ create api_clients" ON public.api_clients;
CREATE POLICY "Admins+ create api_clients"
ON public.api_clients
FOR INSERT
TO authenticated
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Admins+ update api_clients" ON public.api_clients;
CREATE POLICY "Admins+ update api_clients"
ON public.api_clients
FOR UPDATE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]))
WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

DROP POLICY IF EXISTS "Owners delete api_clients" ON public.api_clients;
CREATE POLICY "Owners delete api_clients"
ON public.api_clients
FOR DELETE
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role]));

DROP POLICY IF EXISTS "Admins+ view api_keys" ON public.api_keys;
CREATE POLICY "Admins+ view api_keys"
ON public.api_keys
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.api_clients c
  WHERE c.id = api_keys.api_client_id
    AND app_private.has_org_role(c.organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role])
));

DROP POLICY IF EXISTS "Admins+ revoke api_keys" ON public.api_keys;
CREATE POLICY "Admins+ revoke api_keys"
ON public.api_keys
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.api_clients c
  WHERE c.id = api_keys.api_client_id
    AND app_private.has_org_role(c.organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role])
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.api_clients c
  WHERE c.id = api_keys.api_client_id
    AND app_private.has_org_role(c.organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role])
));

DROP POLICY IF EXISTS "Admins+ view api_events" ON public.api_events;
CREATE POLICY "Admins+ view api_events"
ON public.api_events
FOR SELECT
TO authenticated
USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::public.org_role, 'admin'::public.org_role]));

REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, uuid, public.org_role[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_role_of(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_creator_as_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_voucher_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_creator_as_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_voucher_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO service_role;