ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS allow_downloads boolean NOT NULL DEFAULT true;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS allow_reposts boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "follows readable" ON public.follows;
CREATE POLICY "follows readable by members" ON public.follows FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "likes readable" ON public.likes;
CREATE POLICY "likes readable by members" ON public.likes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "album_posts_select" ON public.album_posts;
CREATE POLICY "album_posts_select" ON public.album_posts FOR SELECT TO authenticated USING (public.is_album_member(album_id, auth.uid()));