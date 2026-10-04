import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/hooks/use-current-user";
import { AvatarImage } from "./avatar-image";
import { Button } from "./ui/button";
import { X } from "lucide-react";
import { toast } from "sonner";

export interface Suggestion {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** People on Lumina the current user doesn't follow yet. */
export function useSuggestions(limit: number) {
  const { data: me } = useCurrentProfile();
  return useQuery({
    queryKey: ["suggested-friends", me?.id, limit],
    enabled: !!me,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", me!.id);
      const exclude = new Set<string>([me!.id, ...(follows ?? []).map((f) => f.following_id)]);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .neq("id", me!.id)
        .eq("suspended", false)
        .order("created_at", { ascending: false })
        .limit(limit + exclude.size);
      if (error) throw error;
      return ((data ?? []) as Suggestion[]).filter((p) => !exclude.has(p.id)).slice(0, limit);
    },
  });
}

export function useFollowUser() {
  const { data: me } = useCurrentProfile();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("follows").insert({ follower_id: me!.id, following_id: id, tier: "public" });
      if (error) throw error;
      await supabase.from("notifications").insert({ user_id: id, actor_id: me!.id, type: "follow", data: { username: me!.username } });
    },
    onSuccess: () => {
      toast.success("Following");
      qc.invalidateQueries({ queryKey: ["profile-counts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not follow"),
  });
}

export function SuggestedFriends() {
  const { data: me } = useCurrentProfile();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const { data: suggestions = [] } = useSuggestions(12);
  const follow = useFollowUser();

  const visible = suggestions.filter((s) => !dismissed.includes(s.id));
  if (hidden || !me || visible.length === 0) return null;

  return (
    <section className="bg-background py-4">
      <div className="flex items-center justify-between px-4 pb-3">
        <h2 className="text-[15px] font-semibold">Suggested for you</h2>
        <div className="flex items-center gap-3">
          <Link to="/people" className="text-sm font-semibold text-primary">See all</Link>
          <button onClick={() => setHidden(true)} aria-label="Hide suggestions" className="text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-none px-4 pb-1">
        {visible.map((p) => (
          <div key={p.id} className="relative flex w-[200px] shrink-0 snap-start flex-col items-center rounded-2xl border border-border bg-card px-4 pb-4 pt-5">
            <button onClick={() => setDismissed((d) => [...d, p.id])} aria-label="Dismiss" className="absolute right-3 top-3 text-foreground/80">
              <X className="h-4 w-4" />
            </button>
            <Link to="/u/$username" params={{ username: p.username }}>
              <AvatarImage path={p.avatar_url} name={p.display_name ?? p.username} size={140} />
            </Link>
            <Link to="/u/$username" params={{ username: p.username }} className="mt-3 w-full truncate text-center text-sm font-semibold">
              {p.display_name || p.username}
            </Link>
            <p className="w-full truncate text-center text-xs text-muted-foreground">Suggested for you</p>
            <Button
              className="mt-3 w-full rounded-lg"
              disabled={follow.isPending}
              onClick={() => follow.mutate(p.id, { onSuccess: () => setDismissed((d) => [...d, p.id]) })}
            >
              Follow
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
