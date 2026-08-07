REVOKE EXECUTE ON FUNCTION public.is_verified_seller(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_verified_seller(uuid) TO authenticated, service_role;