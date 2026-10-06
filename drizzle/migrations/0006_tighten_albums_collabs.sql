DROP POLICY IF EXISTS "collabs readable" ON public.post_collaborators;
CREATE POLICY "collabs readable with post" ON public.post_collaborators FOR SELECT USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_collaborators.post_id));
DROP POLICY IF EXISTS "albums_select" ON public.albums;
CREATE POLICY "albums_select" ON public.albums FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_album_member(id, auth.uid()));