-- Remove broad listing policy. Public bucket already allows direct URL reads
-- without needing a SELECT policy on storage.objects.
DROP POLICY IF EXISTS "Restaurant assets are publicly viewable" ON storage.objects;