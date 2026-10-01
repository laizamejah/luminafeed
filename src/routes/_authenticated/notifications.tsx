import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { AvatarImage } from "@/components/avatar-image";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { Archive, Trash2, MoreHorizontal, Bell, Heart, MessageCircle, UserRoundPlus, Image, CheckCheck, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — Lumina" }, { name: "description", content: "See recent activity and conversations on Lumina." },
    { property: "og:title", content: "Notifications — Lumina" }, { property: "og:description", content: "See recent activity and conversations on Lumina." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
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

function stringField(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "string" && data[key] ? data[key] as string : null;
}

function NotificationsPage() {
  const { data: me } = useCurrentProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: notifs = [], isLoading, error: loadError } = useQuery({
    queryKey: ["notifications", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications")
        .select("id, actor_id, type, data, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)")
        .eq("user_id", me?.id ?? "").is("archived_at", null)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Notif[];
    },
  });
  const { data: incoming = [] } = useQuery({
    queryKey: ["friend-requests", "incoming", me?.id], enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("friend_requests").select("id, sender_id, status").eq("recipient_id", me?.id ?? "");
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["notifications", me?.id] }); void qc.invalidateQueries({ queryKey: ["notifications-unread"] }); };
  const markAll = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Sign in to view notifications");
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me.id).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("All notifications marked as read"); },
    onError: (error) => toast.error(error.message),
  });

  async function markRead(notification: Notif) {
    if (!me || notification.read_at) return;
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notification.id).eq("user_id", me.id);
    if (error) toast.error(error.message);
    else refresh();
  }

  async function open(notification: Notif) {
    await markRead(notification);
    const d = notification.data;
    const postId = stringField(d, "post_id") ?? (stringField(d, "target_type") === "post" ? stringField(d, "target_id") : null);
    const listingId = stringField(d, "listing_id") ?? (stringField(d, "target_type") === "listing" ? stringField(d, "target_id") : null);
    const albumId = stringField(d, "album_id") ?? (stringField(d, "target_type") === "album" ? stringField(d, "target_id") : null);
    if (postId) return navigate({ to: "/p/$postId", params: { postId } });
    if (listingId) return navigate({ to: "/market/$listingId", params: { listingId } });
    if (albumId) return navigate({ to: "/albums/$albumId", params: { albumId } });
    if (notification.type === "message" && notification.actor_id) return navigate({ to: "/messages/$userId", params: { userId: notification.actor_id } });
    if (notification.type.startsWith("story")) return navigate({ to: "/feed" });
    if (notification.actor?.username) return navigate({ to: "/u/$username", params: { username: notification.actor.username } });
    navigate({ to: "/feed" });
  }

  async function remove(notification: Notif, archive: boolean) {
    if (!me) return;
    const query = archive ? supabase.from("notifications").update({ archived_at: new Date().toISOString() }).eq("id", notification.id).eq("user_id", me.id)
      : supabase.from("notifications").delete().eq("id", notification.id).eq("user_id", me.id);
    const { error } = await query;
    if (error) toast.error(error.message);
    else { refresh(); toast.success(archive ? "Notification archived" : "Notification deleted"); }
  }

  const respond = useMutation({
    mutationFn: async ({ senderId, accept }: { senderId: string; accept: boolean }) => {
      if (!me) throw new Error("Sign in to respond");
      const req = incoming.find((r) => r.sender_id === senderId && r.status === "pending");
      if (!req) throw new Error("Request not found");
      const { error } = await supabase.from("friend_requests").update({ status: accept ? "accepted" : "declined" }).eq("id", req.id).eq("recipient_id", me.id);
      if (error) throw error;
      if (accept) {
        const { error: followError } = await supabase.from("follows").upsert({ follower_id: me.id, following_id: senderId, tier: "acquaintance" });
        if (followError) throw followError;
        await supabase.from("notifications").insert({ user_id: senderId, actor_id: me.id, type: "friend_accepted", data: { username: me.username } });
      }
    },
    onSuccess: (_data, variables) => { toast.success(variables.accept ? "Friend added" : "Request declined"); void qc.invalidateQueries({ queryKey: ["friend-requests"] }); },
    onError: (error) => toast.error(error.message),
  });

  const grouped = [
    { title: "New", items: notifs.filter((n) => !n.read_at) },
    { title: "Today", items: notifs.filter((n) => !!n.read_at && isToday(new Date(n.created_at))) },
    { title: "Yesterday", items: notifs.filter((n) => !!n.read_at && isYesterday(new Date(n.created_at))) },
    { title: "Earlier", items: notifs.filter((n) => !!n.read_at && !isToday(new Date(n.created_at)) && !isYesterday(new Date(n.created_at))) },
  ].filter((group) => group.items.length);

  return <main className="mx-auto min-h-screen max-w-2xl bg-background pb-24 md:border-x md:border-border">
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur-xl">
      <Button variant="ghost" size="icon" aria-label="Back to feed" onClick={() => navigate({ to: "/feed" })}><ArrowLeft className="h-5 w-5" /></Button>
      <h1 className="min-w-0 flex-1 text-2xl font-bold">Notifications</h1>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Notification options"><MoreHorizontal className="h-6 w-6" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem disabled={markAll.isPending || !notifs.some((n) => !n.read_at)} onSelect={() => markAll.mutate()}><CheckCheck className="mr-2 h-4 w-4" />Mark all as read</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </header>
    <div className="flex justify-end border-b border-border px-4 py-2"><Button variant="ghost" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending || !notifs.some((n) => !n.read_at)}><CheckCheck className="mr-2 h-4 w-4" />Mark all as read</Button></div>
    {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading notifications…</p>}
    {loadError && <p className="p-6 text-sm text-destructive">Could not load notifications.</p>}
    {!isLoading && !loadError && !notifs.length && <p className="p-10 text-center text-sm text-muted-foreground">No notifications yet.</p>}
    {grouped.map((group) => <section key={group.title} aria-label={group.title}>
      <h2 className="px-4 pb-2 pt-5 text-lg font-bold">{group.title}</h2>
      <ul>{group.items.map((n) => {
        const actor = n.actor;
        const pending = n.type === "friend_request" && actor && incoming.some((r) => r.sender_id === actor.id && r.status === "pending");
        const verb = n.type === "friend_request" ? "sent you a friend request" : n.type === "friend_accepted" ? "accepted your friend request" : n.type === "like" ? "liked your post" : n.type === "dislike" ? "reacted to your post" : n.type === "comment" ? `commented on your post${stringField(n.data, "text") ? `: ${stringField(n.data, "text")}` : ""}` : n.type === "new_post" ? "shared a new post" : n.type === "new_story" ? "posted a new story" : n.type === "story_reaction" ? "reacted to your story" : stringField(n.data, "body") ?? n.type.replaceAll("_", " ");
        const Badge = n.type === "like" || n.type === "dislike" ? Heart : n.type === "comment" ? MessageCircle : n.type.startsWith("friend") ? UserRoundPlus : n.type.includes("post") || n.type.includes("story") ? Image : Bell;
        return <li key={n.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${n.read_at ? "bg-background" : "bg-accent/35"}`}>
          <Button variant="ghost" className="flex h-auto min-w-0 flex-1 justify-start gap-3 p-0 text-left hover:bg-transparent" onClick={() => void open(n)} aria-label={`Open notification: ${actor?.display_name ?? actor?.username ?? "Lumina"} ${verb}`}>
            <span className="relative shrink-0"><AvatarImage path={actor?.avatar_url} name={actor?.display_name ?? actor?.username ?? "Lumina"} size={56} /><span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"><Badge className="h-4 w-4" /></span></span>
            <span className="min-w-0 flex-1 whitespace-normal text-sm leading-snug"><span className="font-semibold">{actor?.display_name ?? actor?.username ?? "Lumina"}</span> {verb}<span className="mt-1 block text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span></span>
          </Button>
          <div className="flex shrink-0 items-center gap-1">
            {!n.read_at && <span className="mr-1 h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More notification actions"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              {!n.read_at && <DropdownMenuItem onSelect={() => void markRead(n)}><CheckCheck className="mr-2 h-4 w-4" />Mark as read</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => void remove(n, true)}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void remove(n, false)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div>
          {pending && actor && <div className="flex shrink-0 flex-col gap-1"><Button size="sm" onClick={() => respond.mutate({ senderId: actor.id, accept: true })} disabled={respond.isPending}>Accept</Button><Button size="sm" variant="outline" onClick={() => respond.mutate({ senderId: actor.id, accept: false })} disabled={respond.isPending}>Decline</Button></div>}
        </li>;
      })}</ul>
    </section>)}
  </main>;
}
