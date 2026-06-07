DROP TRIGGER IF EXISTS trg_org_creator_owner ON public.organizations;
DROP TRIGGER IF EXISTS trg_orgs_touch ON public.organizations;
DROP TRIGGER IF EXISTS trg_touch_organizations ON public.organizations;
DROP TRIGGER IF EXISTS trg_books_touch ON public.finance_books;
DROP TRIGGER IF EXISTS trg_touch_finance_books ON public.finance_books;
DROP TRIGGER IF EXISTS trg_assign_voucher ON public.finance_entries;
DROP TRIGGER IF EXISTS trg_entries_touch ON public.finance_entries;
DROP TRIGGER IF EXISTS trg_touch_finance_entries ON public.finance_entries;

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