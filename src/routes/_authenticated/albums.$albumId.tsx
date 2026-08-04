import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { fetchAlbumFeed } from "@/lib/feed";
import { PostCard } from "@/components/post-card";
import { AvatarImage } from "@/components/avatar-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Plus, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/albums/$albumId")({
  ssr: false,
  component: AlbumPage,
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm">Album not found.</div>,
});

function AlbumPage() {
  const { albumId } = Route.useParams();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [usernameQuery, setUsernameQuery] = useState("");

  const { data: album } = useQuery({
    queryKey: ["album", albumId],
    queryFn: async () => {
      const { data, error } = await supabase.from("albums").select("*").eq("id", albumId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["album-members", albumId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("album_members")
        .select("user_id, role, member:profiles!album_members_user_id_fkey (id, username, display_name, avatar_url)")
        .eq("album_id", albumId);
      if (error) throw error;
      return (data ?? []) as unknown as {
        user_id: string;
        role: string;
        member: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
      }[];
    },
  });

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["album-feed", albumId],
    queryFn: () => fetchAlbumFeed(albumId),
  });

  const { data: myPosts = [] } = useQuery({
    queryKey: ["my-posts-for-album", user?.id],
    enabled: !!user?.id && addOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, caption, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const handle = usernameQuery.trim().replace(/^@/, "");
      if (!handle) throw new Error("Enter a username");
      const { data: profile, error } = await supabase.from("profiles").select("id").eq("username", handle).maybeSingle();
      if (error) throw error;
      if (!profile) throw new Error("No user with that username");
      const { error: mErr } = await supabase.from("album_members").insert({ album_id: albumId, user_id: profile.id, role: "contributor" });
      if (mErr) throw mErr;
      await supabase.from("notifications").insert({
        user_id: profile.id,
        actor_id: user!.id,
        type: "album_invite",
        data: { album_id: albumId },
      });
    },
    onSuccess: () => {
      toast.success("Contributor added");
      setUsernameQuery("");
      setInviteOpen(false);
      qc.invalidateQueries({ queryKey: ["album-members", albumId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add contributor"),
  });

  const addPost = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("album_posts").insert({ album_id: albumId, post_id: postId, added_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to album");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["album-feed", albumId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add post"),
  });

  const isOwner = !!user && album?.owner_id === user.id;
  const isMember = isOwner || members.some((m) => m.user_id === user?.id);

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <header className="border-b border-border px-4 py-6">
        <Link to="/albums" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All albums
        </Link>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-3xl">{album?.name ?? "Album"}</h1>
            {album?.description && <p className="mt-1 text-sm text-muted-foreground">{album.description}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            {isMember && (
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add post</Button>
            )}
            {isOwner && (
              <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" /> Invite</Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex -space-x-2">
            {members.map((m) => (
              <Link key={m.user_id} to="/u/$username" params={{ username: m.member?.username ?? "" }} className="rounded-full ring-2 ring-background">
                <AvatarImage path={m.member?.avatar_url} name={m.member?.display_name ?? m.member?.username} size={28} />
              </Link>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{members.length} contributor{members.length === 1 ? "" : "s"}</span>
        </div>
      </header>

      {isLoading && <p className="p-8 text-sm text-muted-foreground">Loading timeline…</p>}
      {!isLoading && posts.length === 0 && (
        <p className="p-12 text-center text-sm text-muted-foreground">Nothing contributed yet.</p>
      )}
      {posts.map((p) => <PostCard key={p.id} post={p} />)}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite a contributor</DialogTitle>
            <DialogDescription>They can add their own posts to this shared timeline.</DialogDescription>
          </DialogHeader>
          <Input value={usernameQuery} onChange={(e) => setUsernameQuery(e.target.value)} placeholder="@username" />
          <Button onClick={() => invite.mutate()} disabled={invite.isPending}>{invite.isPending ? "Adding…" : "Add contributor"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add one of your posts</DialogTitle>
            <DialogDescription>Pick a post to contribute to this album.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {myPosts.map((p) => (
              <button
                key={p.id}
                onClick={() => addPost.mutate(p.id)}
                className="w-full rounded-xl border border-border px-3 py-2 text-left text-sm hover:bg-secondary/60"
              >
                <span className="line-clamp-1">{p.caption || "Untitled post"}</span>
                <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
              </button>
            ))}
            {myPosts.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">You have no posts yet.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
