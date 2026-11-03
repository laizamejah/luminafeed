-- Allow re-recording a view so repeat visits (upsert) succeed instead of failing the UPDATE leg of the upsert
CREATE POLICY "Viewer re-records own view"
  ON public.story_views
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = viewer_id)
  WITH CHECK (auth.uid() = viewer_id);

GRANT SELECT, INSERT, UPDATE ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;