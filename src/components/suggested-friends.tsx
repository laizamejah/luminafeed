import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/hooks/use-current-user";
import { AvatarImage } from "./avatar-image";
import { Button } from "./ui/button";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";

interface Suggestion {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function SuggestedFriends() {
  const { data: me } = useCurrentProfile();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["suggested-friends", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const [followsRes, reqRes] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", me!.id),
        supabase.from("friend_requests").select("recipient_id").eq("sender_id", me!.id),
      ]);
      const exclude = new Set<string>([me!.id]);
      (followsRes.data ?? []).forEach((f) => exclude.add(f.following_id));
      (reqRes.data ?? []).forEach((r) => exclude.add(r.recipient_id));

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .neq("id", me!.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return ((data ?? []) as Suggestion[]).filter((p) => !exclude.has(p.id)).slice(0, 12);
    },
  });

  const addFriend = useMutation({
    mutationFn: async (recipientId: string) => {
      const { error } = await supabase
        .from("friend_requests")
        .insert({ sender_id: me!.id, recipient_id: recipientId, status: "pending" });
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: recipientId,
        actor_id: me!.id,
        type: "friend_request",
        data: { username: me!.username },
      });
    },
    onSuccess: (_d, id) => {
      toast.success("Friend request sent");
      setDismissed((p) => [...p, id]);
      qc.invalidateQueries({ queryKey: ["friend-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send request"),
  });

  const visible = suggestions.filter((s) => !dismissed.includes(s.id));
  if (hidden || !me || visible.length === 0) return null;

  return (
    <section className="border-b-[6px] border-border/40 bg-card py-3">
      <div className="flex items-center justify-between px-3 pb-2 sm:px-4">
        <h2 className="text-[15px] font-semibold">People you may know</h2>
        <button onClick={() => setHidden(true)} aria-label="Hide suggestions" className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-none px-3 pb-1 sm:px-4">
        {visible.map((p) => (
          <div key={p.id} className="w-[168px] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-background">
            <Link to="/u/$username" params={{ username: p.username }} className="block bg-muted">
              <div className="grid aspect-square place-items-center">
                <AvatarImage path={p.avatar_url} name={p.display_name ?? p.username} size={110} />
              </div>
            </Link>
            <div className="p-2.5">
              <Link to="/u/$username" params={{ username: p.username }} className="block truncate text-sm font-semibold hover:underline">
                {p.display_name || p.username}
              </Link>
              <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
              <Button
                size="sm"
                className="mt-2 w-full"
                onClick={() => addFriend.mutate(p.id)}
                disabled={addFriend.isPending}
              >
                <UserPlus className="mr-1.5 h-4 w-4" /> Add friend
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="mt-1.5 w-full"
                onClick={() => setDismissed((prev) => [...prev, p.id])}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 pt-2 text-center sm:px-4">
        <Link to="/search" className="text-sm font-medium text-muted-foreground hover:underline">See all</Link>
      </div>
    </section>
  );
}
