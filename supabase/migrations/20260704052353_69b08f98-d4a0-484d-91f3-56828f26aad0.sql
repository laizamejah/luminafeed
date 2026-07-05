ALTER POLICY "Anyone can view unexpired stories"
ON public.stories
TO authenticated
USING (expires_at > now());

GRANT SELECT, INSERT, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;

GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;

GRANT SELECT, INSERT, DELETE ON public.story_reactions TO authenticated;
GRANT ALL ON public.story_reactions TO service_role;

CREATE INDEX IF NOT EXISTS idx_stories_expires_created_at
ON public.stories (expires_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stories_user_created_at
ON public.stories (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_views_story_viewer
ON public.story_views (story_id, viewer_id);