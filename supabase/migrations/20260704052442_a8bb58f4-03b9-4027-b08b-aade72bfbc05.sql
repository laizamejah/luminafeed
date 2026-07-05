DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'story_views'
      AND policyname = 'Viewer sees own story views'
  ) THEN
    CREATE POLICY "Viewer sees own story views"
    ON public.story_views
    FOR SELECT
    TO authenticated
    USING (auth.uid() = viewer_id);
  END IF;
END $$;