-- Fix comments failing when only media is attached (empty content)
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_check;
ALTER TABLE public.comments ADD CONSTRAINT comments_content_check 
  CHECK ((char_length(content) BETWEEN 1 AND 2000) OR (content = '' AND media_url IS NOT NULL AND media_kind IS NOT NULL));
