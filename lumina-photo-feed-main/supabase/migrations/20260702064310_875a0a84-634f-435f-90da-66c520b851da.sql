
-- STORIES
CREATE TABLE public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
  caption TEXT,
  background_color TEXT,
  text_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);
GRANT SELECT ON public.stories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view unexpired stories" ON public.stories FOR SELECT USING (expires_at > now());
CREATE POLICY "Users create own stories" ON public.stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own stories" ON public.stories FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX stories_user_expires_idx ON public.stories(user_id, expires_at DESC);

CREATE TABLE public.story_views (
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Story owner sees views" ON public.story_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid()));
CREATE POLICY "Viewer records own view" ON public.story_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);

-- DISLIKES
CREATE TABLE public.dislikes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT ON public.dislikes TO anon, authenticated;
GRANT INSERT, DELETE ON public.dislikes TO authenticated;
GRANT ALL ON public.dislikes TO service_role;
ALTER TABLE public.dislikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads dislikes" ON public.dislikes FOR SELECT USING (true);
CREATE POLICY "Users manage own dislikes" ON public.dislikes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own dislikes" ON public.dislikes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- BLOCKED USERS
CREATE TABLE public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own blocks" ON public.blocked_users FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Users add own blocks" ON public.blocked_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users remove own blocks" ON public.blocked_users FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- CONVERSATION META (per-owner state on a thread with partner)
CREATE TABLE public.conversations (
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archived BOOLEAN NOT NULL DEFAULT false,
  cleared_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, partner_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own conversation state" ON public.conversations FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- MUSIC ON POSTS
ALTER TABLE public.posts
  ADD COLUMN audio_preview_url TEXT,
  ADD COLUMN audio_title TEXT,
  ADD COLUMN audio_artist TEXT,
  ADD COLUMN audio_artwork_url TEXT;

-- MESSAGE NOTIFICATION PREF
ALTER TABLE public.profiles
  ADD COLUMN message_notifications BOOLEAN NOT NULL DEFAULT true;

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dislikes;

-- PUBLIC READ ACCESS (global feed) — anyone can browse posts, media, profiles
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
CREATE POLICY "Posts are viewable by everyone" ON public.posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Post media viewable by everyone" ON public.post_media;
CREATE POLICY "Post media viewable by everyone" ON public.post_media FOR SELECT USING (true);
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
GRANT SELECT ON public.posts TO anon;
GRANT SELECT ON public.post_media TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.likes TO anon;
GRANT SELECT ON public.comments TO anon;

-- STORAGE: allow public read of media bucket for signed-out viewers (still signed URLs but SELECT policy)
DROP POLICY IF EXISTS "Public read media" ON storage.objects;
CREATE POLICY "Public read media" ON storage.objects FOR SELECT USING (bucket_id IN ('media','avatars'));
