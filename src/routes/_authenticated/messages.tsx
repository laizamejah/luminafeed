import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AvatarImage } from "@/components/avatar-image";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Archive, ArchiveRestore, Trash2, Ban, Search, Settings, PenSquare, ChevronLeft } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesLayout,
});

type MessageTab = "inbox" | "unread" | "communities" | "requests";

interface Partner { id: string; username: string; display_name: string | null; avatar_url: string | null }
interface Thread { partner: Partner; last: { content: string; created_at: string } }

function MessagesLayout() {
  const { data: user } = useCurrentUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<MessageTab>("inbox");
  const [search, setSearch] = useState("");

  // Active stories (past 24h) — for the "Post a note" horizontal row
  const { data: activeStoryUsers = [] } = useQuery({
    queryKey: ["messages-active-stories"],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("stories")
        .select("user_id, author:profiles!stories_user_id_fkey (id, username, display_name, avatar_url)")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      const seen = new Set<string>();
      const out: Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }> = [];
      for (const row of data ?? []) {
        const a = row.author as unknown as { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
        if (!a || seen.has(a.id)) continue;
        seen.add(a.id);
        out.push(a);
      }
      return out;
    },
  });

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
    queryFn: async () => {
      const { data, error } = await supabase.from("messages")
        .select("id, sender_id, recipient_id, content, created_at")
        .or(`sender_id.eq.${user!.id},recipient_id.eq.${user!.id}`)
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      const map = new Map<string, { content: string; created_at: string }>();
      for (const m of data ?? []) {
        const other = m.sender_id === user!.id ? m.recipient_id : m.sender_id;
        if (blocked.includes(other)) continue;
        const state = convStates.find((c) => c.partner_id === other);
        if (state?.cleared_at && new Date(m.created_at) <= new Date(state.cleared_at)) continue;
        if (!map.has(other)) map.set(other, { content: m.content, created_at: m.created_at });
      }
      const partnerIds = Array.from(map.keys());
      if (partnerIds.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", partnerIds);
      return partnerIds.map((id) => ({ partner: profiles?.find((p) => p.id === id)!, last: map.get(id)! })).filter((t): t is Thread => !!t.partner);
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
    // tab filter (unread requires the recipient=me and unread; we approximate using last-message sender)
    return true;
  });

  const showingThread = /\/messages\/[^/]+$/.test(pathname);

  return (
    <div className="mx-auto grid max-w-5xl min-h-[calc(100vh-3.5rem)] md:min-h-screen grid-cols-1 md:grid-cols-[360px_1fr]">
      <aside className={cn("md:border-r md:border-border md:overflow-y-auto", showingThread && "hidden md:block")}>
        {/* Facebook-style header */}
        <div className="sticky top-14 md:top-0 z-10 bg-background/95 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Link to="/feed" className="md:hidden p-1 -ml-1 text-foreground">
                <ChevronLeft className="h-6 w-6" />
              </Link>
              <h1 className="text-2xl font-bold tracking-tight">Chats</h1>
            </div>
            <div className="flex items-center gap-1">
              <Link to="/settings" className="grid h-9 w-9 place-items-center rounded-full liquid-glass" aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Link>
              <Link to="/search" className="grid h-9 w-9 place-items-center rounded-full liquid-glass" aria-label="New chat">
                <PenSquare className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Search bar */}
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

          {/* Notes / active stories row */}
          <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-3">
            <Link to="/create" className="flex w-16 shrink-0 flex-col items-center gap-1.5" aria-label="Post a note">
              <div className="relative">
                <AvatarImage path={null} name={user?.email ?? "You"} size={56} />
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium shadow-sm ring-1 ring-border whitespace-nowrap">
                  Post a note
                </span>
              </div>
              <span className="text-[11px] truncate max-w-full">Your note</span>
            </Link>
            {activeStoryUsers.map((u) => (
              <Link
                key={u.id}
                to="/u/$username"
                params={{ username: u.username }}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <div className="relative rounded-full p-[2px] bg-gradient-to-br from-[color:var(--ochre)] to-violet-500">
                  <div className="rounded-full bg-background p-[2px]">
                    <AvatarImage path={u.avatar_url} name={u.display_name ?? u.username} size={52} />
                  </div>
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
                </div>
                <span className="text-[11px] truncate max-w-full">{u.display_name || u.username}</span>
              </Link>
            ))}
          </div>

          {/* Tabs */}
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
                  tab === t.key
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground",
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
                  <AvatarImage path={t.partner.avatar_url} name={t.partner.display_name ?? t.partner.username} size={56} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold truncate">{t.partner.display_name || t.partner.username}</div>
                    <div className="text-[13px] text-muted-foreground truncate">You: {t.last.content}</div>
                  </div>
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
          {visible.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{showArchived ? "Nothing archived." : "No conversations yet."}</p>}
        </div>
      </aside>
      <section className={cn(showingThread ? "block" : "hidden md:block")}><Outlet /></section>
    </div>
  );
}
