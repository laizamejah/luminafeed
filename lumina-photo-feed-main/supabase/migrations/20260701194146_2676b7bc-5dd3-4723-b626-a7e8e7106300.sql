-- Friend requests
CREATE TABLE public.friend_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sender_id, recipient_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;
GRANT ALL ON public.friend_requests TO service_role;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own friend requests" ON public.friend_requests FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Send friend requests" ON public.friend_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id);
CREATE POLICY "Recipient can update status" ON public.friend_requests FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);
CREATE POLICY "Sender can cancel" ON public.friend_requests FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);
CREATE TRIGGER friend_requests_touch BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id OR auth.uid() = user_id);
CREATE POLICY "Mark own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);

-- Profiles searchable by any signed-in user (drop if exists first for safety)
DROP POLICY IF EXISTS "Profiles searchable by authenticated" ON public.profiles;
CREATE POLICY "Profiles searchable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);