import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Heartbeats the current user's presence row every 60s. */
export function usePresenceHeartbeat() {
  const { data: user } = useCurrentUser();
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const beat = async () => {
      if (cancelled) return;
      await supabase.from("user_status").upsert(
        { user_id: user.id, is_online: true, last_active_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    };
    beat();
    const id = window.setInterval(beat, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id]);
}

export interface PresenceEntry {
  user_id: string;
  last_active_at: string;
  is_online: boolean;
}

export function usePresence(userIds: string[]) {
  const key = [...userIds].sort().join(",");
  return useQuery({
    queryKey: ["presence", key],
    enabled: userIds.length > 0,
    refetchInterval: 45_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_status")
        .select("user_id, last_active_at, is_online")
        .in("user_id", userIds);
      const map: Record<string, PresenceEntry> = {};
      for (const r of (data ?? []) as PresenceEntry[]) map[r.user_id] = r;
      return map;
    },
  });
}

export function isActive(entry?: PresenceEntry | null) {
  if (!entry) return false;
  return Date.now() - new Date(entry.last_active_at).getTime() < ONLINE_WINDOW_MS;
}

/** "4m", "2h", "3d" — how long since last active. Empty when active now. */
export function lastActiveLabel(entry?: PresenceEntry | null) {
  if (!entry) return "";
  const mins = Math.floor((Date.now() - new Date(entry.last_active_at).getTime()) / 60000);
  if (mins < 5) return "";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
