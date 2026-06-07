CREATE OR REPLACE FUNCTION public.add_creator_as_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
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
SET search_path TO 'public'
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

DROP TRIGGER IF EXISTS trg_touch_finance_entries_updated_at ON public.finance_entries;
CREATE TRIGGER trg_touch_finance_entries_updated_at
BEFORE UPDATE ON public.finance_entries
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

REVOKE ALL ON FUNCTION public.add_creator_as_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_voucher_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;