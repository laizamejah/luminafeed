
CREATE TYPE public.follow_tier AS ENUM ('close_friend','acquaintance','public');
CREATE TYPE public.collab_status AS ENUM ('pending','accepted','declined');
CREATE TYPE public.media_type AS ENUM ('image','video');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  show_metrics_publicly BOOLEAN NOT NULL DEFAULT false,
  hide_reels BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base_username TEXT; final_username TEXT; suffix INT := 0;
BEGIN
  base_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'user');
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  IF base_username = '' THEN base_username := 'user'; END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1; final_username := base_username || suffix::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (NEW.id, final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', final_username),
    NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- FOLLOWS
CREATE TABLE public.follows (
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier public.follow_tier NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows readable" ON public.follows FOR SELECT USING (true);
CREATE POLICY "insert own follows" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "update own follows" ON public.follows FOR UPDATE USING (auth.uid() = follower_id);
CREATE POLICY "delete own follows" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- POSTS
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  caption TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_name TEXT,
  comments_enabled BOOLEAN NOT NULL DEFAULT true,
  is_reel BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX posts_user_created_idx ON public.posts (user_id, created_at DESC);
CREATE INDEX posts_created_idx ON public.posts (created_at DESC);
CREATE INDEX posts_geo_idx ON public.posts (latitude, longitude);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT ON public.posts TO anon;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts readable" ON public.posts FOR SELECT USING (true);
CREATE POLICY "insert own posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- POST_COLLABORATORS (before post_media because policy references it)
CREATE TABLE public.post_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.collab_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, collaborator_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_collaborators TO authenticated;
GRANT SELECT ON public.post_collaborators TO anon;
GRANT ALL ON public.post_collaborators TO service_role;
ALTER TABLE public.post_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collabs readable" ON public.post_collaborators FOR SELECT USING (true);
CREATE POLICY "owner invites" ON public.post_collaborators FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));
CREATE POLICY "owner or collab updates" ON public.post_collaborators FOR UPDATE
  USING (auth.uid() = collaborator_id OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));
CREATE POLICY "owner or collab deletes" ON public.post_collaborators FOR DELETE
  USING (auth.uid() = collaborator_id OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));

-- POST_MEDIA
CREATE TABLE public.post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  media_type public.media_type NOT NULL DEFAULT 'image',
  width INT,
  height INT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX post_media_post_idx ON public.post_media (post_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_media TO authenticated;
GRANT SELECT ON public.post_media TO anon;
GRANT ALL ON public.post_media TO service_role;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media readable" ON public.post_media FOR SELECT USING (true);
CREATE POLICY "uploader inserts media" ON public.post_media FOR INSERT
  WITH CHECK (auth.uid() = uploader_id AND (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.post_collaborators c WHERE c.post_id = post_id AND c.collaborator_id = auth.uid() AND c.status = 'accepted')
  ));
CREATE POLICY "uploader or owner deletes media" ON public.post_media FOR DELETE
  USING (auth.uid() = uploader_id OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));

-- LIKES
CREATE TABLE public.likes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT SELECT ON public.likes TO anon;
GRANT ALL ON public.likes TO service_role;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes readable" ON public.likes FOR SELECT USING (true);
CREATE POLICY "like as self" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unlike own" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON public.comments (post_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT ON public.comments TO anon;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments readable" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comment as self" ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.comments_enabled = true));
CREATE POLICY "delete own or on own post" ON public.comments FOR DELETE
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));

-- MESSAGES
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX messages_pair_idx ON public.messages (sender_id, recipient_id, created_at);
CREATE INDEX messages_recipient_idx ON public.messages (recipient_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own dms" ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "send as self" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "recipient marks read" ON public.messages FOR UPDATE USING (auth.uid() = recipient_id);
CREATE POLICY "sender deletes own" ON public.messages FOR DELETE USING (auth.uid() = sender_id);
