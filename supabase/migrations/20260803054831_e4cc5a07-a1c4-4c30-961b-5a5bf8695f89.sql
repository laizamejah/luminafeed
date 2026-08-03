ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS media_kind TEXT;
ALTER TABLE public.comments ALTER COLUMN content SET DEFAULT '';