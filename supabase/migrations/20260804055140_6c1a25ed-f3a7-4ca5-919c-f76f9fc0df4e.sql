REVOKE ALL ON FUNCTION public.is_album_owner(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_album_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_album_owner(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_album_member(UUID, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;