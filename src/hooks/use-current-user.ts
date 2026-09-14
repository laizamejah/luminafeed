import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PROFILE_SELECT } from "@/lib/profile-columns";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 30_000,
  });
}

export function useCurrentProfile() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["profile", "me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select(PROFILE_SELECT).eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Child-account status for the signed-in user (private, owner/guardian only). */
export function useKidStatus() {
  const { data: user } = useCurrentUser();
  const query = useQuery({
    queryKey: ["profile-safety", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_safety")
        .select("is_kid, birth_year, parent_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return { ...query, isKid: query.data?.is_kid ?? false };
}
