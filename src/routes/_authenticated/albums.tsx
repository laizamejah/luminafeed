import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, Plus, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/albums")({
  ssr: false,
  component: AlbumsPage,
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm">No albums found.</div>,
});

interface AlbumRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  owner: { username: string; display_name: string | null } | null;
}

function AlbumsPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: albums = [], isLoading } = useQuery({
    queryKey: ["albums", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: memberships } = await supabase.from("album_members").select("album_id").eq("user_id", user!.id);
      const ids = (memberships ?? []).map((m) => m.album_id as string);
      const { data, error } = await supabase
        .from("albums")
        .select("id, name, description, owner_id, created_at, owner:profiles!albums_owner_id_fkey (username, display_name)")
        .or([`owner_id.eq.${user!.id}`, ids.length ? `id.in.(${ids.join(",")})` : null].filter(Boolean).join(","))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AlbumRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in first");
      if (!name.trim()) throw new Error("Give the album a name");
      const { data, error } = await supabase
        .from("albums")
        .insert({ owner_id: user.id, name: name.trim(), description: description.trim() || null })
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("album_members").insert({ album_id: data.id, user_id: user.id, role: "owner" });
      return data.id;
    },
    onSuccess: () => {
      toast.success("Album created");
      setOpen(false);
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["albums"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create album"),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-3xl">Shared albums</h1>
          <p className="text-sm text-muted-foreground">Event feeds where everyone invited contributes to one timeline.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0"><Plus className="mr-2 h-4 w-4" /> New album</Button>
      </header>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {albums.map((a) => (
          <Link
            key={a.id}
            to="/albums/$albumId"
            params={{ albumId: a.id }}
            className="rounded-2xl border border-border p-4 transition-colors hover:bg-secondary/50"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h2 className="truncate font-medium">{a.name}</h2>
            </div>
            {a.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{a.description}</p>}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {new Date(a.created_at).toLocaleDateString()} · by @{a.owner?.username ?? "unknown"}
            </p>
          </Link>
        ))}
        {!isLoading && albums.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No shared albums yet. Create one for your next event.
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New shared album</DialogTitle>
            <DialogDescription>Invite contributors afterwards from the album page.</DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Album name" maxLength={80} />
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this album about?" maxLength={300} />
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create album"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
