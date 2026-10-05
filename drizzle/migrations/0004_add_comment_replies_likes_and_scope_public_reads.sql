ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments(parent_id);

CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
GRANT SELECT ON public.comment_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.comment_likes TO authenticated;
GRANT ALL ON public.comment_likes TO service_role;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comment likes readable on visible posts"
ON public.comment_likes FOR SELECT TO public
USING (EXISTS (
  SELECT 1 FROM public.comments c
  JOIN public.posts p ON p.id = c.post_id
  WHERE c.id = comment_likes.comment_id
    AND (p.archived_at IS NULL OR p.user_id = auth.uid())
));
CREATE POLICY "Users add own comment likes"
ON public.comment_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own comment likes"
ON public.comment_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone reads dislikes" ON public.dislikes;
CREATE POLICY "Dislikes readable for visible posts"
ON public.dislikes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.posts p
  WHERE p.id = dislikes.post_id
    AND (p.archived_at IS NULL OR p.user_id = auth.uid())
));

DROP POLICY IF EXISTS "comments readable" ON public.comments;
CREATE POLICY "Comments readable on visible posts"
ON public.comments FOR SELECT TO public
USING (EXISTS (
  SELECT 1 FROM public.posts p
  WHERE p.id = comments.post_id
    AND (p.archived_at IS NULL OR p.user_id = auth.uid())
));

DROP POLICY IF EXISTS "Post media viewable by everyone" ON public.post_media;
DROP POLICY IF EXISTS "media readable" ON public.post_media;
CREATE POLICY "Post media readable on visible posts"
ON public.post_media FOR SELECT TO public
USING (EXISTS (
  SELECT 1 FROM public.posts p
  WHERE p.id = post_media.post_id
    AND (p.archived_at IS NULL OR p.user_id = auth.uid())
));