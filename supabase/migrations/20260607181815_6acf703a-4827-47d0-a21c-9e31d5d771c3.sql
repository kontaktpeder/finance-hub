
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Storage policies on finance-attachments bucket
-- Path convention: <organization_id>/<entry_id_or_unassigned>/<filename>
CREATE POLICY "Members read finance attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'finance-attachments'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "Editors upload finance attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'finance-attachments'
    AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[])
  );

CREATE POLICY "Editors update finance attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'finance-attachments'
    AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin','editor']::public.org_role[])
  );

CREATE POLICY "Admins delete finance attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'finance-attachments'
    AND public.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner','admin']::public.org_role[])
  );
