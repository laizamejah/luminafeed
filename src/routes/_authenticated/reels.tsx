import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { prefetchSignedUrls } from "@/hooks/use-signed-url";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useCurrentProfile, useKidStatus } from "@/hooks/use-current-user";
import { PostMedia } from "@/components/post-media";
import { AvatarImage } from "@/components/avatar-image";
import { CommentsPanel } from "@/components/comments-panel";
import { Heart, MessageCircle, Send, Repeat2, Bookmark, MoreHorizontal, Music2, X, ArrowLeft, SlidersHorizontal, Volume2, VolumeX, Download } from "lucide-react";
import { downloadMedia } from "@/lib/download-media";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";



export const Route = createFileRoute("/_authenticated/reels")({
  component: ReelsPage,
});

interface Reel {
  id: string;
  caption: string | null;
  user_id: string;
  audio_title?: string | null;
  audio_artist?: string | null;
  allow_downloads?: boolean;
  allow_reposts?: boolean;
  author: { id: string; username: string; display_name: string | null; avatar_url: string | null };
  media: { storage_path: string; media_type: "image" | "video"; width: number | null; height: number | null; thumbnail_path: string | null; position: number }[];
}

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
}

function ReelsPage() {
  const { data: user } = useCurrentUser();
  const { data: me } = useCurrentProfile();
  const { isKid } = useKidStatus();

  const { data: reels, isLoading } = useQuery({
    queryKey: ["reels", user?.id, isKid],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("posts")
        .select(`id, caption, user_id, audio_title, audio_artist, allow_downloads, allow_reposts,
          author:profiles!posts_user_id_fkey (id, username, display_name, avatar_url),
          media:post_media!inner (storage_path, media_type, width, height, thumbnail_path, position)`)
        .eq("is_reel", true)
        .eq("post_media.media_type", "video")
        .order("created_at", { ascending: false })
        .limit(50);
      if (isKid) q = q.eq("kid_safe", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Reel[];
    },
  });

  const qcRoot = useQueryClient();
  useEffect(() => {
    if (!reels?.length) return;
    const paths = reels.flatMap((r) => r.media.flatMap((m) => [m.storage_path, m.thumbnail_path]));
    prefetchSignedUrls(qcRoot, "media", paths);
  }, [reels, qcRoot]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading reels…</div>;
  if (!reels?.length) return (
    <div className="p-12 text-center">
      <p className="font-serif text-xl">No reels yet.</p>
      <p className="mt-2 text-sm text-muted-foreground">When creators publish short-form video, they'll appear here.</p>
    </div>
  );

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] top-0 z-[45] w-full max-w-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-contain bg-black [scrollbar-width:none] md:bottom-0 lg:left-64">
      <div className="pointer-events-none sticky top-0 z-30 flex h-0 items-start gap-4 px-4 text-primary-foreground drop-shadow-lg" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>
        <Link to="/feed" className="pointer-events-auto md:hidden" aria-label="Back to feed"><ArrowLeft className="h-6 w-6" /></Link>
        <span className="text-xl font-semibold">Reels</span>
        <span className="text-xl font-semibold opacity-60">Friends</span>
        <Link to="/settings" className="pointer-events-auto ml-auto" aria-label="Reels preferences"><SlidersHorizontal className="h-6 w-6" /></Link>
      </div>

      {reels.map((r) => <ReelItem key={r.id} reel={r} />)}
    </div>
  );
}

function ReelItem({ reel }: { reel: Reel }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const media = [...reel.media].sort((a, b) => a.position - b.position)[0];
  
  const isOwn = user?.id === reel.user_id;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const { data: saved = false } = useQuery({
    queryKey: ["saved-post", user?.id, reel.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("saved_posts").select("post_id").eq("post_id", reel.id).eq("user_id", user?.id ?? "").maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });


  const { data: likeState } = useQuery({
    queryKey: ["reel-likes", reel.id, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [countRes, meRes] = await Promise.all([
        supabase.from("likes").select("*", { count: "exact", head: true }).eq("post_id", reel.id),
        supabase.from("likes").select("post_id").eq("post_id", reel.id).eq("user_id", user!.id).maybeSingle(),
      ]);
      return { count: countRes.count ?? 0, liked: !!meRes.data };
    },
    initialData: { count: 0, liked: false },
  });

  const { data: commentCount = 0 } = useQuery({
    queryKey: ["reel-comments", reel.id],
    queryFn: async () => {
      const { count } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", reel.id);
      return count ?? 0;
    },
  });

  const { data: isFollowing } = useQuery({
    queryKey: ["reel-follow", user?.id, reel.user_id],
    enabled: !!user?.id && !isOwn,
    queryFn: async () => {
      const { data } = await supabase.from("follows").select("tier")
        .eq("follower_id", user!.id).eq("following_id", reel.user_id).maybeSingle();
      return !!data;
    },
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", reel.user_id);
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: reel.user_id, tier: "public" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reel-follow"] });
      qc.invalidateQueries({ queryKey: ["profile-counts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update follow"),
  });

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (likeState?.liked) {
        await supabase.from("likes").delete().eq("post_id", reel.id).eq("user_id", user.id);
      } else {
        await supabase.from("likes").insert({ post_id: reel.id, user_id: user.id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reel-likes", reel.id] });
    },
  });

  async function share() {
    const url = `${window.location.origin}/p/${reel.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `@${reel.author.username} on Lumina`, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Reel link copied");
    } catch {
      toast.error("Could not share reel");
    }
  }

  async function toggleSaved() {
    if (!user) return toast.info("Sign in to save reels");
    const result = saved
      ? await supabase.from("saved_posts").delete().eq("post_id", reel.id).eq("user_id", user.id)
      : await supabase.from("saved_posts").insert({ post_id: reel.id, user_id: user.id });
    if (result.error) return toast.error(result.error.message);
    qc.invalidateQueries({ queryKey: ["saved-post", user.id, reel.id] });
  }

  return (
    <div className="relative flex h-full w-full snap-start items-center justify-center overflow-hidden bg-primary">
      <div className="relative mx-auto h-full w-full md:max-w-[480px]">
        <PostMedia
          path={media.storage_path}
          type="video"
          width={media.width}
          height={media.height}
          thumbnailPath={media.thumbnail_path}
          autoplayOnView
          initialMuted={muted}
          preload="auto"
          unloadOnExit={false}
          showMuteButton={false}
          tapToPause
          fill
          objectFit="cover"
          className="h-full w-full"
        />

        <Button variant="ghost" size="icon" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute reel" : "Mute reel"} className="absolute bottom-3 right-3 z-20 h-8 w-8 rounded-full bg-primary/50 text-primary-foreground hover:bg-primary/70">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>

        {/* Right action rail — compact, bottom → centre */}
        <div
          className="absolute right-2 bottom-20 z-20 flex flex-col items-center gap-3 text-primary-foreground drop-shadow-lg"
        >
          <RailButton
            label={compact(likeState?.count ?? 0)}
            onClick={() => (user ? toggleLike.mutate() : toast.info("Sign in to react"))}
            ariaLabel="Like reel"
          >
            <Heart className={`h-6 w-6 ${likeState?.liked ? "fill-destructive text-destructive" : ""}`} strokeWidth={1.8} />
          </RailButton>

          <RailButton
            label={compact(commentCount)}
            onClick={() => setCommentsOpen((o) => !o)}
            ariaLabel="Comment on reel"
          >
            <MessageCircle className="h-6 w-6" strokeWidth={1.8} />
          </RailButton>

          {(reel.allow_reposts ?? true) && (
            <RailButton label="" onClick={() => void share()} ariaLabel="Repost link">
              <Repeat2 className="h-6 w-6" strokeWidth={1.8} />
            </RailButton>
          )}
          <RailButton label="" onClick={() => void share()} ariaLabel="Share reel">
            <Send className="h-6 w-6" strokeWidth={1.8} />
          </RailButton>
          {(isOwn || (reel.allow_downloads ?? true)) && (
            <RailButton label="" onClick={() => void downloadMedia(media.storage_path, `lumina-${reel.author.username}-${reel.id.slice(0, 8)}`)} ariaLabel="Download reel">
              <Download className="h-6 w-6" strokeWidth={1.8} />
            </RailButton>
          )}
          <RailButton label="" onClick={() => void toggleSaved()} ariaLabel={saved ? "Remove saved reel" : "Save reel"}>
            <Bookmark className={`h-6 w-6 ${saved ? "fill-current" : ""}`} strokeWidth={1.8} />
          </RailButton>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground" aria-label="More reel options"><MoreHorizontal className="h-6 w-6" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to="/p/$postId" params={{ postId: reel.id }}>View post</Link></DropdownMenuItem><DropdownMenuItem onSelect={() => void share()}>Share link</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>


        {/* Bottom author block */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-primary/90 via-primary/45 to-transparent px-3 pt-16 text-primary-foreground"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <div className="pointer-events-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pr-16">
            <Link to="/u/$username" params={{ username: reel.author.username }} className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0">
                <AvatarImage path={reel.author.avatar_url} name={reel.author.display_name ?? reel.author.username} size={36} />
              </span>
              <span className="min-w-0 truncate text-[15px] font-semibold">
                {reel.author.display_name ?? reel.author.username}
              </span>
            </Link>
            {!isOwn && user && (
              <button
                onClick={() => toggleFollow.mutate()}
                className="shrink-0 rounded-full border border-primary-foreground/70 px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/15"
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
          {reel.caption && (
            <p className="pointer-events-auto mt-2 line-clamp-2 whitespace-pre-wrap pr-16 text-sm text-primary-foreground/95">{reel.caption}</p>
          )}
          {(reel.audio_title || reel.audio_artist) && (
            <span className="pointer-events-auto mt-2 flex items-center gap-1 truncate pr-16 text-xs text-primary-foreground/80">
              <Music2 className="h-3 w-3 shrink-0" />
              {[reel.audio_title, reel.audio_artist].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>

        {/* Slide-up comments sheet — video keeps playing behind it */}
        {commentsOpen && (
          <div
            className="absolute inset-x-0 bottom-0 z-30 flex h-[58%] animate-[slide-up_240ms_ease-out] flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-semibold">Comments</span>
              <button onClick={() => setCommentsOpen(false)} aria-label="Close comments" className="rounded-full p-1.5 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <CommentsPanel postId={reel.id} postOwnerId={reel.user_id} onNavigate={() => setCommentsOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );

}


function RailButton({
  children,
  label,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <Button variant="ghost" onClick={onClick} aria-label={ariaLabel} className="flex h-12 w-11 flex-col items-center gap-0.5 p-0 text-primary-foreground hover:bg-transparent hover:text-primary-foreground active:scale-90">
      <span className="grid h-8 w-8 place-items-center">
        {children}
      </span>
      {label && <span className="text-[10px] font-semibold">{label}</span>}
    </Button>
  );

}
