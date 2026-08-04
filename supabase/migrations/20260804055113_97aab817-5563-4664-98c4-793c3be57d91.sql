-- 1. Profile customization
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_position NUMERIC NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS feed_layout TEXT NOT NULL DEFAULT 'comfortable',
  ADD COLUMN IF NOT EXISTS hide_public_counts BOOLEAN NOT NULL DEFAULT false;

-- 2. EXIF / camera metadata on media
ALTER TABLE public.post_media
  ADD COLUMN IF NOT EXISTS exif JSONB;

-- 3. Shared albums
CREATE TABLE IF NOT EXISTS public.albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.albums TO authenticated;
GRANT ALL ON public.albums TO service_role;
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "albums_select" ON public.albums FOR SELECT TO authenticated USING (true);
CREATE POLICY "albums_insert" ON public.albums FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "albums_update" ON public.albums FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "albums_delete" ON public.albums FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER trg_albums_touch BEFORE UPDATE ON public.albums FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.album_members (
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'contributor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.album_members TO authenticated;
GRANT ALL ON public.album_members TO service_role;
ALTER TABLE public.album_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_album_owner(_album_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.albums WHERE id = _album_id AND owner_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_album_member(_album_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.albums WHERE id = _album_id AND owner_id = _user_id
    UNION ALL
    SELECT 1 FROM public.album_members WHERE album_id = _album_id AND user_id = _user_id
  )
$$;

CREATE POLICY "album_members_select" ON public.album_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "album_members_insert" ON public.album_members FOR INSERT TO authenticated WITH CHECK (public.is_album_owner(album_id, auth.uid()));
CREATE POLICY "album_members_update" ON public.album_members FOR UPDATE TO authenticated USING (public.is_album_owner(album_id, auth.uid())) WITH CHECK (public.is_album_owner(album_id, auth.uid()));
CREATE POLICY "album_members_delete" ON public.album_members FOR DELETE TO authenticated USING (public.is_album_owner(album_id, auth.uid()) OR auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.album_posts (
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, post_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.album_posts TO authenticated;
GRANT ALL ON public.album_posts TO service_role;
ALTER TABLE public.album_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "album_posts_select" ON public.album_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "album_posts_insert" ON public.album_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = added_by AND public.is_album_member(album_id, auth.uid()));
CREATE POLICY "album_posts_delete" ON public.album_posts FOR DELETE TO authenticated USING (auth.uid() = added_by OR public.is_album_owner(album_id, auth.uid()));

-- 4. Micro-tips
CREATE TABLE IF NOT EXISTS public.tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.tips TO authenticated;
GRANT ALL ON public.tips TO service_role;
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tips_select" ON public.tips FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "tips_insert" ON public.tips FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id);

CREATE INDEX IF NOT EXISTS idx_album_posts_album ON public.album_posts(album_id);
CREATE INDEX IF NOT EXISTS idx_tips_recipient ON public.tips(recipient_id);