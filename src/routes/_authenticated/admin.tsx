import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-admin";
import { AvatarImage } from "@/components/avatar-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin portal · Lumina" },
      { name: "description", content: "Manage Lumina members, review accounts and suspend or restore access." },
      { property: "og:title", content: "Admin portal · Lumina" },
      { property: "og:description", content: "Manage Lumina members, review accounts and suspend or restore access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

interface AdminProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  is_kid: boolean;
  suspended: boolean | null;
  suspension_reason: string | null;
}

function AdminPage() {
  const { data: isAdmin, isLoading: checking } = useIsAdmin();
  const [q, setQ] = useState("");
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users", q],
    enabled: !!isAdmin,
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, created_at, is_kid, suspended, suspension_reason")
        .order("created_at", { ascending: false })
        .limit(200);
      if (q.trim()) query = query.or(`username.ilike.%${q.trim()}%,display_name.ilike.%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AdminProfile[];
    },
  });

  const toggleSuspend = useMutation({
    mutationFn: async (u: AdminProfile) => {
      const next = !u.suspended;
      const { error } = await supabase
        .from("profiles")
        .update({
          suspended: next,
          suspended_at: next ? new Date().toISOString() : null,
          suspension_reason: next ? "Suspended by an administrator" : null,
        } as never)
        .eq("id", u.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next ? "Account suspended" : "Account restored");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  if (checking) return <div className="p-8 text-sm text-muted-foreground">Checking access…</div>;
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 font-serif text-2xl">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">This portal is restricted to Lumina administrators.</p>
      </div>
    );

  const active = users?.filter((u) => !u.suspended).length ?? 0;
  const suspended = users?.filter((u) => u.suspended).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-3xl">Admin portal</h1>
          <p className="text-sm text-muted-foreground">Members, access and moderation</p>
        </div>
        <div className="shrink-0 rounded-xl border border-white/10 px-4 py-2 text-center">
          <Users className="mx-auto h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold tabular-nums">{users?.length ?? 0}</span>
        </div>
      </header>

      <div className="mt-6 flex gap-3 text-xs text-muted-foreground">
        <span className="rounded-full border border-white/10 px-3 py-1">{active} active</span>
        <span className="rounded-full border border-white/10 px-3 py-1">{suspended} suspended</span>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search members by name or username"
        className="mt-6"
      />

      <div className="mt-6 divide-y divide-border rounded-2xl border border-border">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading members…</p>}
        {users?.length === 0 && <p className="p-6 text-sm text-muted-foreground">No members found.</p>}
        {users?.map((u) => (
          <div key={u.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0">
                <AvatarImage path={u.avatar_url} name={u.display_name ?? u.username} size={40} />
              </span>
              <div className="min-w-0">
                <Link to="/u/$username" params={{ username: u.username }} className="block truncate text-sm font-medium hover:underline">
                  {u.display_name || u.username}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  @{u.username} · joined {new Date(u.created_at).toLocaleDateString()}
                  {u.is_kid ? " · kid account" : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {u.suspended ? (
                <span className="rounded-full bg-destructive/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  Suspended
                </span>
              ) : (
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              )}
              <Button
                size="sm"
                variant={u.suspended ? "outline" : "destructive"}
                disabled={toggleSuspend.isPending}
                onClick={() => toggleSuspend.mutate(u)}
              >
                {u.suspended ? "Unsuspend" : "Suspend"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
