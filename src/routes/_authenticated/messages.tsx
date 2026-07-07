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

  const visible = threads.filter((t) => {
    const state = convStates.find((c) => c.partner_id === t.partner.id);
    return showArchived ? !!state?.archived : !state?.archived;
  });

  return (
    <div className="mx-auto grid max-w-5xl h-[calc(100vh-3.5rem)] md:h-screen grid-cols-1 md:grid-cols-[320px_1fr]">
      <aside className="border-r border-border overflow-y-auto">
        <div className="flex items-center justify-between px-4 pt-6 pb-2">
          <h1 className="font-serif text-2xl">Messages</h1>
          <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
            {showArchived ? "Inbox" : "Archived"}
          </button>
        </div>
        <div>
          {visible.map((t) => {
            const active = pathname.endsWith(`/messages/${t.partner.id}`);
            const state = convStates.find((c) => c.partner_id === t.partner.id);
            return (
              <div key={t.partner.id} className={cn("group flex items-center gap-2 pr-2 hover:bg-secondary/60", active && "bg-secondary")}>
                <Link to="/messages/$userId" params={{ userId: t.partner.id }} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
                  <AvatarImage path={t.partner.avatar_url} name={t.partner.display_name ?? t.partner.username} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.partner.display_name || t.partner.username}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.last.content}</div>
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground" aria-label="Conversation options">
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
      <section className="hidden md:block"><Outlet /></section>
      <section className="md:hidden"><Outlet /></section>
    </div>
  );
}
