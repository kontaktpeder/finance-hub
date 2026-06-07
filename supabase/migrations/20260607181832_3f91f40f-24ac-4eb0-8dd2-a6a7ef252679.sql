
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.org_role[]) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.org_role_of(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.add_creator_as_owner() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_voucher_number() FROM anon, authenticated, public;

DROP POLICY IF EXISTS "Admins+ revoke api_keys" ON public.api_keys;
CREATE POLICY "Admins+ revoke api_keys"
  ON public.api_keys FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.api_clients c
    WHERE c.id = api_client_id
      AND public.has_org_role(c.organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.api_clients c
    WHERE c.id = api_client_id
      AND public.has_org_role(c.organization_id, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  ));
