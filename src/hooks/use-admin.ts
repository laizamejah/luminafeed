import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./use-current-user";

export function useIsAdmin() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role" as never, {
        _user_id: user!.id,
        _role: "admin",
      } as never);
      if (error) return false;
      return Boolean(data);
    },
  });
}
