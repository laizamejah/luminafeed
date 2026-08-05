import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useCurrentProfile } from "@/hooks/use-current-user";
import { AvatarImage } from "@/components/avatar-image";
import { PresenceAvatar } from "@/components/presence-avatar";
import { usePresence, usePresenceHeartbeat, isActive, lastActiveLabel } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MoreVertical, Archive, ArchiveRestore, Trash2, Ban, Search, Settings, PenSquare, ChevronLeft, Check, CheckCheck } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesLayout,
});

type MessageTab = "inbox" | "unread" | "communities" | "requests";

interface Partner { id: string; username: string; display_name: string | null; avatar_url: string | null }
interface Thread {
  partner: Partner;
  last: { content: string; created_at: string; mine: boolean; read: boolean };
  unread: number;
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MessagesLayout() {
  const { data: user } = useCurrentUser();
  const { data: profile } = useCurrentProfile();
  usePresenceHeartbeat();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<MessageTab>("inbox");
  const [search, setSearch] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const { data: blocked = [] } = useQuery({
    queryKey: ["blocked", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", user!.id);
      return (data ?? []).map((r) => r.blocked_id);
    },
  });

  const { data: convStates = [] } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("conversations").select("partner_id, archived, cleared_at").eq("owner_id", user!.id);
      return data ?? [];
    },
  });

  const { data: threads = [] } = useQuery<Thread[]>({
    queryKey: ["threads", user?.id, convStates.length, blocked.length],
    enabled: !!user,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages")
        .select("id, sender_id, recipient_id, content, created_at, read_at")
        .or(`sender_id.eq.${user!.id},recipient_id.eq.${user!.id}`)
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      const map = new Map<string, Thread["last"]>();
      const unread = new Map<string, number>();
      for (const m of data ?? []) {
        const other = m.sender_id === user!.id ? m.recipient_id : m.sender_id;
        if (blocked.includes(other)) continue;
        const state = convStates.find((c) => c.partner_id === other);
        if (state?.cleared_at && new Date(m.created_at) <= new Date(state.cleared_at)) continue;
        if (m.recipient_id === user!.id && !m.read_at) unread.set(other, (unread.get(other) ?? 0) + 1);
        if (!map.has(other)) {
          map.set(other, {
            content: m.content,
            created_at: m.created_at,
            mine: m.sender_id === user!.id,
            read: !!m.read_at,
          });
        }
      }
      const partnerIds = Array.from(map.keys());
      if (partnerIds.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", partnerIds);
      return partnerIds
        .map((id) => ({ partner: profiles?.find((p) => p.id === id)!, last: map.get(id)!, unread: unread.get(id) ?? 0 }))
        .filter((t): t is Thread => !!t.partner);
    },
  });

  const partnerIds = useMemo(() => threads.map((t) => t.partner.id), [threads]);
  const { data: presence = {} } = usePresence(partnerIds);

  // Notes (24h) from the current user + conversation partners
  const { data: notes = [] } = useQuery({
    queryKey: ["user-notes", user?.id, partnerIds.length],
    enabled: !!user,
    queryFn: async () => {
      const ids = [user!.id, ...partnerIds];
      const { data } = await supabase
        .from("user_notes")
        .select("id, user_id, content, created_at")
        .in("user_id", ids)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      const seen = new Set<string>();
      return (data ?? []).filter((n) => (seen.has(n.user_id) ? false : (seen.add(n.user_id), true)));
    },
  });
  const myNote = notes.find((n) => n.user_id === user?.id);

  const postNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("user_notes").insert({ user_id: user!.id, content: noteText.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteOpen(false); setNoteText("");
      qc.invalidateQueries({ queryKey: ["user-notes"] });
      toast.success("Note posted for 24 hours");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: requestCount = 0 } = useQuery({
    queryKey: ["message-requests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase.from("friend_requests")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user!.id).eq("status", "pending");
      return count ?? 0;
    },
  });

  const setArchive = useMutation({
    mutationFn: async ({ partnerId, archived }: { partnerId: string; archived: boolean }) => {
      await supabase.from("conversations").upsert({ owner_id: user!.id, partner_id: partnerId, archived, updated_at: new Date().toISOString() });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const clearConv = useMutation({
    mutationFn: async (partnerId: string) => {
      await supabase.from("conversations").upsert({ owner_id: user!.id, partner_id: partnerId, cleared_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    },
    onSuccess: (_d, partnerId) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (pathname.endsWith(`/messages/${partnerId}`)) nav({ to: "/messages" });
      toast.success("Conversation cleared");
    },
  });

  const blockUser = useMutation({
    mutationFn: async (partnerId: string) => {
      await supabase.from("blocked_users").insert({ blocker_id: user!.id, blocked_id: partnerId });
    },
    onSuccess: (_d, partnerId) => {
      qc.invalidateQueries({ queryKey: ["blocked"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (pathname.endsWith(`/messages/${partnerId}`)) nav({ to: "/messages" });
      toast.success("User blocked");
    },
  });

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      t.partner.username.toLowerCase().includes(q) ||
      (t.partner.display_name ?? "").toLowerCase().includes(q) ||
      t.last.content.toLowerCase().includes(q)
    );
  }, [threads, search]);

  const visible = searched.filter((t) => {
    const state = convStates.find((c) => c.partner_id === t.partner.id);
    if (showArchived) return !!state?.archived;
    if (state?.archived) return false;
    if (tab === "unread") return t.unread > 0;
    if (tab === "communities") return false;
    if (tab === "requests") return false;
    return true;
  });

  const activePartners = threads.filter((t) => isActive(presence[t.partner.id]));
  const showingThread = /\/messages\/[^/]+$/.test(pathname);

  return (
    <div className="mx-auto grid max-w-5xl min-h-[calc(100vh-3.5rem)] md:min-h-screen grid-cols-1 md:grid-cols-[360px_1fr]">
      <aside className={cn("md:border-r md:border-border md:overflow-y-auto", showingThread && "hidden md:block")}>
        <div className="sticky top-14 md:top-0 z-10 bg-background/95 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Link to="/feed" className="md:hidden p-1 -ml-1 text-foreground" aria-label="Back">
                <ChevronLeft className="h-6 w-6" />
              </Link>
              <h1 className="text-2xl font-bold tracking-tight">Chats</h1>
            </div>
            <div className="flex items-center gap-1">
              <Link to="/settings" className="relative grid h-9 w-9 place-items-center rounded-full liquid-glass" aria-label="Settings">
                <Settings className="h-4 w-4" />
                {requestCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {requestCount}
                  </span>
                )}
              </Link>
              <Link to="/search" className="grid h-9 w-9 place-items-center rounded-full liquid-glass" aria-label="New chat">
                <PenSquare className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 rounded-full bg-secondary/70 px-4 py-2.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Active & notes tray */}
          <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-3">
            <button onClick={() => setNoteOpen(true)} className="flex w-16 shrink-0 flex-col items-center gap-1.5" aria-label="Post a note">
              <div className="relative pt-3">
                <span className="absolute -top-0 left-1/2 -translate-x-1/2 max-w-[76px] truncate rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium shadow-sm ring-1 ring-border whitespace-nowrap">
                  {myNote ? myNote.content : "Post a note"}
                </span>
                <AvatarImage path={profile?.avatar_url} name={profile?.display_name ?? profile?.username ?? "You"} size={56} />
              </div>
              <span className="text-[11px] truncate max-w-full">Your note</span>
            </button>
            {activePartners.map((t) => {
              const note = notes.find((n) => n.user_id === t.partner.id);
              return (
                <Link
                  key={t.partner.id}
                  to="/messages/$userId"
                  params={{ userId: t.partner.id }}
                  className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                >
                  <div className="relative pt-3">
                    {note && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 max-w-[76px] truncate rounded-full bg-secondary px-2 py-0.5 text-[10px] shadow-sm ring-1 ring-border whitespace-nowrap">
                        {note.content}
                      </span>
                    )}
                    <PresenceAvatar
                      path={t.partner.avatar_url}
                      name={t.partner.display_name ?? t.partner.username}
                      size={56}
                      active={isActive(presence[t.partner.id])}
                      label={lastActiveLabel(presence[t.partner.id])}
                    />
                  </div>
                  <span className="text-[11px] truncate max-w-full">{t.partner.display_name || t.partner.username}</span>
                </Link>
              );
            })}
          </div>

          <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-3">
            {([
              { key: "inbox", label: "Inbox" },
              { key: "unread", label: "Unread" },
              { key: "communities", label: "Communities" },
              { key: "requests", label: "Requests" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                  tab === t.key ? "bg-primary/10 text-primary" : "bg-secondary/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={cn(
                "ml-auto shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
                showArchived ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {showArchived ? "Show inbox" : "Archived"}
            </button>
          </div>
        </div>

        <div>
          {visible.map((t) => {
            const active = pathname.endsWith(`/messages/${t.partner.id}`);
            const state = convStates.find((c) => c.partner_id === t.partner.id);
            return (
              <div key={t.partner.id} className={cn("group flex items-center gap-2 pr-2 hover:bg-secondary/60", active && "bg-secondary")}>
                <Link to="/messages/$userId" params={{ userId: t.partner.id }} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
                  <PresenceAvatar
                    path={t.partner.avatar_url}
                    name={t.partner.display_name ?? t.partner.username}
                    size={56}
                    active={isActive(presence[t.partner.id])}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-[15px] truncate", t.unread > 0 ? "font-bold" : "font-semibold")}>
                      {t.partner.display_name || t.partner.username}
                    </div>
                    <div className={cn("flex items-center gap-1 text-[13px] truncate", t.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                      <span className="truncate">{t.last.mine ? `You: ${t.last.content}` : t.last.content}</span>
                      <span className="shrink-0">· {timeAgo(t.last.created_at)}</span>
                      {t.last.mine && (t.last.read
                        ? <CheckCheck className="h-3.5 w-3.5 shrink-0" />
                        : <Check className="h-3.5 w-3.5 shrink-0" />)}
                    </div>
                  </div>
                  {t.unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger className="p-1 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground" aria-label="Conversation options">
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setArchive.mutate({ partnerId: t.partner.id, archived: !state?.archived })}>
                      {state?.archived ? <><ArchiveRestore className="h-3.5 w-3.5 mr-2" />Unarchive</> : <><Archive className="h-3.5 w-3.5 mr-2" />Archive</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => clearConv.mutate(t.partner.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" />Delete chat
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => blockUser.mutate(t.partner.id)} className="text-destructive">
                      <Ban className="h-3.5 w-3.5 mr-2" />Block user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {showArchived ? "Nothing archived."
                : tab === "unread" ? "You're all caught up."
                : tab === "communities" ? "No communities yet."
                : tab === "requests" ? "No message requests." : "No conversations yet."}
            </p>
          )}
        </div>
      </aside>
      <section className={cn(showingThread ? "block" : "hidden md:block")}><Outlet /></section>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post a note</DialogTitle></DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value.slice(0, 60))}
            placeholder="Share a thought…"
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">Visible for 24 hours · {noteText.length}/60</p>
          <DialogFooter>
            <Button onClick={() => postNote.mutate()} disabled={!noteText.trim() || postNote.isPending}>Share</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
