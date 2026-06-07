GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_books TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_events TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.finance_books TO service_role;
GRANT ALL ON public.finance_entries TO service_role;
GRANT ALL ON public.finance_attachments TO service_role;
GRANT ALL ON public.api_clients TO service_role;
GRANT ALL ON public.api_keys TO service_role;
GRANT ALL ON public.api_events TO service_role;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.org_role[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_role_of(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_creator_as_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_voucher_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO authenticated, service_role;

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

DROP TRIGGER IF EXISTS trg_touch_finance_entries_updated_at ON public.finance_entries;
CREATE TRIGGER trg_touch_finance_entries_updated_at
BEFORE UPDATE ON public.finance_entries
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();