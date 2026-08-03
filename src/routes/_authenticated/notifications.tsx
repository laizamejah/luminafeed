import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { AvatarImage } from "@/components/avatar-image";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Archive, Trash2, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

type Notif = {
  id: string;
  actor_id: string | null;
  type: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
};

function NotificationsPage() {
  const { data: me } = useCurrentProfile();
  const qc = useQueryClient();

  const { data: notifs = [], isLoading } = useQuery({
    queryKey: ["notifications", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, actor_id, type, data, read_at, created_at, archived_at, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)")
        .eq("user_id", me!.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Notif[];
    },
  });

  // Load incoming pending friend requests to know which notif still needs action
  const { data: incoming = [] } = useQuery({
    queryKey: ["friend-requests", "incoming", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id, sender_id, status")
        .eq("recipient_id", me!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!me || notifs.length === 0) return;
    const unread = notifs.filter((n) => !n.read_at).map((n) => n.id);
    if (unread.length === 0) return;
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unread).then(() => {
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    });
  }, [me, notifs, qc]);

  const markAll = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("No user");
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", me.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", me?.id] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      toast.success("Marked all as read");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not mark all"),
  });

  const archiveAll = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("No user");
      const { error } = await supabase
        .from("notifications")
        .update({ archived_at: new Date().toISOString() })
        .eq("user_id", me.id)
        .is("archived_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", me?.id] });
      toast.success("Archived all notifications");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not archive all"),
  });

  const respond = useMutation({
    mutationFn: async ({ senderId, accept }: { senderId: string; accept: boolean }) => {
      const req = incoming.find((r) => r.sender_id === senderId);
      if (!req) throw new Error("Request not found");
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: accept ? "accepted" : "declined" })
        .eq("id", req.id);
      if (error) throw error;
      if (accept) {
        // Create mutual follow at 'acquaintance' tier
        await supabase.from("follows").upsert([
          { follower_id: me!.id, following_id: senderId, tier: "acquaintance" },
          { follower_id: senderId, following_id: me!.id, tier: "acquaintance" },
        ]);
        await supabase.from("notifications").insert({
          user_id: senderId,
          actor_id: me!.id,
          type: "friend_accepted",
          data: { username: me!.username },
        });
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.accept ? "Friend added" : "Declined");
      qc.invalidateQueries({ queryKey: ["friend-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const pendingSenderIds = new Set(incoming.filter((r) => r.status === "pending").map((r) => r.sender_id));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <h1 className="font-serif text-3xl mb-6">Notifications</h1>
      <div className="mb-4 flex gap-2">
        <Button onClick={() => markAll.mutate()} disabled={markAll.isPending || !me}>Mark all as read</Button>
        <Button variant="outline" onClick={() => archiveAll.mutate()} disabled={archiveAll.isPending || !me}>
          <Archive className="mr-2 h-4 w-4" />Archive all
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notifs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {notifs.map((n) => {
            const actor = n.actor;
            const isFriendReq = n.type === "friend_request" && actor && pendingSenderIds.has(actor.id);
            const postId = typeof n.data?.post_id === "string" ? (n.data.post_id as string) : null;
            const verb =
              n.type === "friend_request" ? "sent you a friend request"
              : n.type === "friend_accepted" ? "accepted your friend request"
              : n.type === "like" ? "reacted to your post"
              : n.type === "dislike" ? "reacted to your post"
              : n.type === "comment" ? `commented: ${typeof n.data?.text === "string" ? n.data.text : ""}`
              : n.type === "new_post" ? "shared a new post"
              : n.type === "new_story" ? "posted a new story"
              : n.type;

            const body = (
              <>
                <div className="text-sm">
                  {actor && <span className="font-medium">@{actor.username}</span>}{" "}
                  <span className={n.read_at ? "text-muted-foreground" : ""}>{verb}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </>
            );

            return (
              <li key={n.id} className={`flex items-center gap-3 p-3 ${n.read_at ? "" : "bg-secondary/40"}`}>
                {actor && (
                  <Link to="/u/$username" params={{ username: actor.username }}>
                    <AvatarImage path={actor.avatar_url} name={actor.display_name ?? actor.username} size={40} />
                  </Link>
                )}
                <div className="flex-1 min-w-0">
                  {postId ? (
                    <Link to="/p/$postId" params={{ postId }} className="block hover:underline">{body}</Link>
                  ) : actor && !isFriendReq ? (
                    <Link to="/u/$username" params={{ username: actor.username }} className="block hover:underline">{body}</Link>
                  ) : (
                    body
                  )}
                </div>

                {isFriendReq && actor && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => respond.mutate({ senderId: actor.id, accept: true })} disabled={respond.isPending}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => respond.mutate({ senderId: actor.id, accept: false })} disabled={respond.isPending}>
                      Decline
                    </Button>
                  </div>
                )}
                {!isFriendReq && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const { error } = await supabase.from("notifications").update({ archived_at: new Date().toISOString() }).eq("id", n.id).eq("user_id", me!.id);
                      if (error) toast.error("Could not archive");
                      else {
                        qc.invalidateQueries({ queryKey: ["notifications", me?.id] });
                        toast.success("Archived");
                      }
                    }}>
                      <Archive className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const { error } = await supabase.from("notifications").delete().eq("id", n.id).eq("user_id", me!.id);
                      if (error) toast.error("Could not delete");
                      else {
                        qc.invalidateQueries({ queryKey: ["notifications", me?.id] });
                        toast.success("Deleted");
                      }
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
