import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const EXPIRY = 60 * 60; // 1h

export function useSignedUrl(bucket: string, path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed", bucket, path],
    enabled: !!path,
    staleTime: (EXPIRY - 60) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path!, EXPIRY);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export async function getSignedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, EXPIRY);
  if (error) throw error;
  return data.signedUrl;
}
