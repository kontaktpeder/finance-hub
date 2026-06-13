GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.org_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_role_of(uuid, uuid) TO authenticated, service_role;