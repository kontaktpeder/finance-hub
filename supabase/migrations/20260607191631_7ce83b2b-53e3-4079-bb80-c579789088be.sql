
CREATE TYPE public.receipt_draft_status AS ENUM ('draft','reviewed','converted','rejected');

CREATE TABLE public.finance_receipt_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  book_id uuid NOT NULL,
  uploaded_by uuid,
  attachment_id uuid,
  extracted_text text,
  ai_suggestion jsonb,
  ai_model text,
  status public.receipt_draft_status NOT NULL DEFAULT 'draft',
  converted_entry_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipt_drafts_org ON public.finance_receipt_drafts(organization_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_receipt_drafts TO authenticated;
GRANT ALL ON public.finance_receipt_drafts TO service_role;

ALTER TABLE public.finance_receipt_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view receipt drafts" ON public.finance_receipt_drafts
  FOR SELECT TO authenticated
  USING (app_private.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Editors+ insert receipt drafts" ON public.finance_receipt_drafts
  FOR INSERT TO authenticated
  WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role]));

CREATE POLICY "Editors+ update receipt drafts" ON public.finance_receipt_drafts
  FOR UPDATE TO authenticated
  USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role]))
  WITH CHECK (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role]));

CREATE POLICY "Editors+ delete receipt drafts" ON public.finance_receipt_drafts
  FOR DELETE TO authenticated
  USING (app_private.has_org_role(organization_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role]));

CREATE TRIGGER trg_receipt_drafts_touch
  BEFORE UPDATE ON public.finance_receipt_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies for finance-attachments bucket (allow org members to upload/read their org folder)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Members read finance attachments') THEN
    CREATE POLICY "Members read finance attachments" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'finance-attachments'
        AND app_private.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Editors+ upload finance attachments') THEN
    CREATE POLICY "Editors+ upload finance attachments" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'finance-attachments'
        AND app_private.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role])
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Editors+ delete finance attachments') THEN
    CREATE POLICY "Editors+ delete finance attachments" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'finance-attachments'
        AND app_private.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'editor'::org_role])
      );
  END IF;
END $$;
