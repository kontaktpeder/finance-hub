DROP POLICY IF EXISTS "Editors upload finance attachments" ON storage.objects;
DROP POLICY IF EXISTS "Editors update finance attachments" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete finance attachments" ON storage.objects;
DROP POLICY IF EXISTS "Members read finance attachments" ON storage.objects;
DROP POLICY IF EXISTS "Editors+ upload finance attachments" ON storage.objects;
DROP POLICY IF EXISTS "Editors+ update finance attachments" ON storage.objects;
DROP POLICY IF EXISTS "Editors+ delete finance attachments" ON storage.objects;

CREATE POLICY "Members read finance attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'finance-attachments'
  AND app_private.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Editors+ upload finance attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'finance-attachments'
  AND app_private.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'editor'::org_role])
);

CREATE POLICY "Editors+ update finance attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'finance-attachments'
  AND app_private.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'editor'::org_role])
)
WITH CHECK (
  bucket_id = 'finance-attachments'
  AND app_private.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'editor'::org_role])
);

CREATE POLICY "Editors+ delete finance attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'finance-attachments'
  AND app_private.has_org_role(((storage.foldername(name))[1])::uuid, auth.uid(), ARRAY['owner'::org_role, 'admin'::org_role, 'editor'::org_role])
);