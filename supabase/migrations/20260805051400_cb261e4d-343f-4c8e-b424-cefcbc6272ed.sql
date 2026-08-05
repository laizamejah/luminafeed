CREATE TABLE public.user_status (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_online boolean NOT NULL DEFAULT false,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_status TO authenticated;
GRANT ALL ON public.user_status TO service_role;
ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view status" ON public.user_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users upsert own status" ON public.user_status FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own status" ON public.user_status FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_status_touch BEFORE UPDATE ON public.user_status FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX user_notes_expires_idx ON public.user_notes(expires_at DESC);
GRANT SELECT, INSERT, DELETE ON public.user_notes TO authenticated;
GRANT ALL ON public.user_notes TO service_role;
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view notes" ON public.user_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create own notes" ON public.user_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notes" ON public.user_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);