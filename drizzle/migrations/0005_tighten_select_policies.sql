DROP POLICY IF EXISTS "album_members_select" ON public.album_members;
CREATE POLICY "album_members_select" ON public.album_members FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_album_member(album_id, auth.uid()));
DROP POLICY IF EXISTS "Listing media viewable by everyone" ON public.listing_media;
CREATE POLICY "Listing media viewable for active listings" ON public.listing_media FOR SELECT USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_media.listing_id AND (l.status = 'active' OR l.seller_id = auth.uid())));
DROP POLICY IF EXISTS "Authenticated can view notes" ON public.user_notes;
CREATE POLICY "Authenticated can view active notes" ON public.user_notes FOR SELECT TO authenticated USING (auth.uid() = user_id OR expires_at IS NULL OR expires_at > now());