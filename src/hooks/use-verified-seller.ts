import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./use-current-user";

export interface SellerApplication {
  user_id: string;
  status: string;
  business_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  city: string | null;
  payout_method: string;
  mpesa_number: string | null;
  stripe_account_id: string | null;
}

/** Verified-seller record for an arbitrary user (public read). */
export function useSellerStatus(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["seller-status", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("verified_sellers")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      return (data ?? null) as SellerApplication | null;
    },
  });
}

/** Current user's seller application + convenience flag. */
export function useMySellerStatus() {
  const { data: user } = useCurrentUser();
  const q = useSellerStatus(user?.id);
  return { ...q, isVerified: q.data?.status === "approved", userId: user?.id ?? null };
}
