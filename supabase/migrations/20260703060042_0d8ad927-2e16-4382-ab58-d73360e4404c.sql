CREATE TABLE public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.story_reactions TO authenticated;
GRANT ALL ON public.story_reactions TO service_role;

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story reactions readable by authenticated"
ON public.story_reactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "users react to stories"
ON public.story_reactions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users remove own reactions"
ON public.story_reactions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX story_reactions_story_idx ON public.story_reactions(story_id);