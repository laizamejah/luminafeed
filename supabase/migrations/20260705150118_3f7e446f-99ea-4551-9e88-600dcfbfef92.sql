ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS audio_preview_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_title TEXT,
  ADD COLUMN IF NOT EXISTS audio_artist TEXT,
  ADD COLUMN IF NOT EXISTS audio_artwork_url TEXT;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user_archived
  ON public.notifications (user_id, archived_at);