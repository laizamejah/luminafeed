import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/hooks/use-current-user";
import { searchSpotify } from "@/lib/spotify.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AvatarImage } from "@/components/avatar-image";
import { PostMedia } from "@/components/post-media";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Music, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

export const Route = createFileRoute("/_authenticated/search")({
  component: SearchPage,
});

function SearchPage() {
  const { data: me } = useCurrentProfile();
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const spotifyFn = useServerFn(searchSpotify);
  const term = q.trim();

  const { data: users = [] } = useQuery({
    queryKey: ["search-users", term, me?.id],
    enabled: !!me && term.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url").neq("id", me!.id)
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`).limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["search-posts", term],
    enabled: term.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select(`
        id, caption, is_reel,
        author:profiles!posts_user_id_fkey(username),
        media:post_media(storage_path, media_type, width, height, position)
      `).or(`caption.ilike.%${term}%,location_name.ilike.%${term}%`).order("created_at", { ascending: false }).limit(24);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: tracks = [], isFetching: musicLoading, refetch: refetchMusic } = useQuery({
    queryKey: ["search-music", term],
    enabled: false,
    queryFn: () => spotifyFn({ data: { query: term } }),
  });

  const { data: outgoing = [] } = useQuery({
    queryKey: ["friend-requests", "outgoing", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("friend_requests").select("recipient_id, status").eq("sender_id", me!.id);
      return data ?? [];
    },
  });

  const sendReq = useMutation({
    mutationFn: async (recipientId: string) => {
      const { error } = await supabase.from("friend_requests").insert({ sender_id: me!.id, recipient_id: recipientId, status: "pending" });
      if (error) throw error;
      await supabase.from("notifications").insert({ user_id: recipientId, actor_id: me!.id, type: "friend_request", data: { username: me!.username } });
    },
    onSuccess: () => { toast.success("Friend request sent"); qc.invalidateQueries({ queryKey: ["friend-requests"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const statusFor = (uid: string) => outgoing.find((o) => o.recipient_id === uid)?.status;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  function playPreview(id: string, url: string) {
    if (!audioRef.current) return;
    if (playingId === id) { audioRef.current.pause(); setPlayingId(null); return; }
    audioRef.current.src = url;
    audioRef.current.play().then(() => setPlayingId(id)).catch(() => setPlayingId(null));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <h1 className="font-serif text-3xl mb-6">Search</h1>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="People, posts, or music…" className="pl-9" />
      </div>

      <Tabs defaultValue="people" className="mt-6">
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="music" onClick={() => term && refetchMusic()}>Music</TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <div className="divide-y divide-border rounded-md border border-border">
            {term === "" ? <p className="p-6 text-sm text-muted-foreground">Type a name to begin.</p>
              : users.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No one found.</p>
              : users.map((u) => {
                const status = statusFor(u.id);
                return (
                  <div key={u.id} className="flex items-center gap-3 p-3">
                    <Link to="/u/$username" params={{ username: u.username }} className="flex items-center gap-3 flex-1 min-w-0">
                      <AvatarImage path={u.avatar_url} name={u.display_name ?? u.username} size={44} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.display_name ?? u.username}</div>
                        <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                      </div>
                    </Link>
                    {status === "pending" ? <Button size="sm" variant="secondary" disabled>Requested</Button>
                      : status === "accepted" ? <Button size="sm" variant="ghost" disabled>Friends</Button>
                      : <Button size="sm" onClick={() => sendReq.mutate(u.id)} disabled={sendReq.isPending}>Add friend</Button>}
                  </div>
                );
              })}
          </div>
        </TabsContent>

        <TabsContent value="posts">
          {term === "" ? <p className="p-6 text-sm text-muted-foreground">Type to search posts.</p>
            : posts.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No posts.</p>
            : <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
              {posts.map((p) => {
                const first = [...(p.media ?? [])].sort((a, b) => a.position - b.position)[0];
                if (!first) return null;
                return (
                  <Link key={p.id} to="/p/$postId" params={{ postId: p.id }} className="aspect-square overflow-hidden bg-muted">
                    <PostMedia path={first.storage_path} type={first.media_type} width={first.width} height={first.height} className="!aspect-square" />
                  </Link>
                );
              })}
            </div>}
        </TabsContent>

        <TabsContent value="music">
          <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
          {term === "" ? <p className="p-6 text-sm text-muted-foreground">Search Spotify tracks.</p>
            : musicLoading ? <p className="p-6 text-sm text-muted-foreground">Searching…</p>
            : tracks.length === 0 ? <div className="p-6"><Button variant="outline" onClick={() => refetchMusic()}>Search Spotify</Button></div>
            : <div className="divide-y divide-border rounded-md border border-border">
              {tracks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3">
                  {t.artwork_url ? <img src={t.artwork_url} alt="" className="h-10 w-10 rounded" /> : <div className="h-10 w-10 rounded bg-muted grid place-items-center"><Music className="h-4 w-4" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.artist}</div>
                  </div>
                  {t.preview_url ? (
                    <button onClick={() => playPreview(t.id, t.preview_url!)} className="rounded-full bg-foreground text-background p-2">
                      {playingId === t.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </button>
                  ) : <span className="text-[10px] text-muted-foreground">No preview</span>}
                </div>
              ))}
            </div>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
