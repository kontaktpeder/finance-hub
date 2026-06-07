
-- Attach add_creator_as_owner trigger
DROP TRIGGER IF EXISTS trg_add_creator_as_owner ON public.organizations;
CREATE TRIGGER trg_add_creator_as_owner
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_owner();

-- Attach voucher number trigger
DROP TRIGGER IF EXISTS trg_assign_voucher_number ON public.finance_entries;
CREATE TRIGGER trg_assign_voucher_number
BEFORE INSERT ON public.finance_entries
FOR EACH ROW EXECUTE FUNCTION public.assign_voucher_number();

-- Attach updated_at triggers
DROP TRIGGER IF EXISTS trg_touch_organizations ON public.organizations;
CREATE TRIGGER trg_touch_organizations BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_finance_books ON public.finance_books;
CREATE TRIGGER trg_touch_finance_books BEFORE UPDATE ON public.finance_books
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_finance_entries ON public.finance_entries;
CREATE TRIGGER trg_touch_finance_entries BEFORE UPDATE ON public.finance_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
