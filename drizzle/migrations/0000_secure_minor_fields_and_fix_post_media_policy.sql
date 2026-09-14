-- 1. Fix broken collaborator check on post_media INSERT policy
DROP POLICY IF EXISTS "uploader inserts media" ON public.post_media;
CREATE POLICY "uploader inserts media" ON public.post_media
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = uploader_id AND (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id AND p.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.post_collaborators c
      WHERE c.post_id = post_media.post_id
        AND c.collaborator_id = auth.uid()
        AND c.status = 'accepted'::collab_status
    )
  )
);

-- 2. Child-safety data moves into its own restricted table
CREATE TABLE IF NOT EXISTS public.profile_safety (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  birth_year integer,
  is_kid boolean NOT NULL DEFAULT false,
  parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.profile_safety (id, birth_year, is_kid, parent_id)
SELECT id, birth_year, COALESCE(is_kid, false), parent_id
FROM public.profiles
WHERE birth_year IS NOT NULL OR is_kid IS TRUE OR parent_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.profile_safety TO authenticated;
GRANT ALL ON public.profile_safety TO service_role;

ALTER TABLE public.profile_safety ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own safety row readable" ON public.profile_safety;
CREATE POLICY "own safety row readable" ON public.profile_safety
FOR SELECT TO authenticated
USING (auth.uid() = id OR auth.uid() = parent_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "own safety row insert" ON public.profile_safety;
CREATE POLICY "own safety row insert" ON public.profile_safety
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id OR auth.uid() = parent_id);

DROP POLICY IF EXISTS "own safety row update" ON public.profile_safety;
CREATE POLICY "own safety row update" ON public.profile_safety
FOR UPDATE TO authenticated
USING (auth.uid() = id OR auth.uid() = parent_id OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.uid() = id OR auth.uid() = parent_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Stop exposing the legacy minor columns on the public profiles table
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, bio, show_metrics_publicly, hide_reels,
  created_at, theme_preference, message_notifications, suspended, suspended_at,
  suspension_reason, cover_url, cover_position, accent_color, feed_layout,
  hide_public_counts, location, hometown, relationship_status, education,
  category, verified
) ON public.profiles TO anon, authenticated;