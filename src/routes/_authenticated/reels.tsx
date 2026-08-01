import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useCurrentProfile } from "@/hooks/use-current-user";
import { PostMedia } from "@/components/post-media";
import { AvatarImage } from "@/components/avatar-image";
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Music2 } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/reels")({
  component: ReelsPage,
});

interface Reel {
  id: string;
  caption: string | null;
  user_id: string;
  audio_title?: string | null;
  audio_artist?: string | null;
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

  const { data: reels, isLoading } = useQuery({
    queryKey: ["reels", user?.id, me?.is_kid],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("posts")
        .select(`id, caption, user_id, audio_title, audio_artist,
          author:profiles!posts_user_id_fkey (id, username, display_name, avatar_url),
          media:post_media!inner (storage_path, media_type, width, height, thumbnail_path, position)`)
        .eq("is_reel", true)
        .eq("post_media.media_type", "video")
        .order("created_at", { ascending: false })
        .limit(50);
      if (me?.is_kid) q = q.eq("kid_safe", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Reel[];
    },
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading reels…</div>;
  if (!reels?.length) return (
    <div className="p-12 text-center">
      <p className="font-serif text-xl">No reels yet.</p>
      <p className="mt-2 text-sm text-muted-foreground">When creators publish short-form video, they'll appear here.</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto overflow-x-hidden bg-black snap-y snap-mandatory lg:left-64">
      {/* Reels title overlay */}
      <div
        className="pointer-events-none fixed left-0 right-0 z-30 flex items-center px-4 lg:left-64"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="pointer-events-auto text-2xl font-semibold tracking-tight text-white drop-shadow-lg">Reels</span>
      </div>
      {reels.map((r) => <ReelItem key={r.id} reel={r} />)}
    </div>
  );
}

function ReelItem({ reel }: { reel: Reel }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const media = [...reel.media].sort((a, b) => a.position - b.position)[0];
  const isMobile = useIsMobile();
  const isOwn = user?.id === reel.user_id;

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

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-black snap-start">
      <div className="relative h-full w-full max-w-[520px]">
        <PostMedia
          path={media.storage_path}
          type="video"
          width={media.width}
          height={media.height}
          thumbnailPath={media.thumbnail_path}
          autoplayOnView
          initialMuted={false}
          preload={isMobile ? "auto" : "metadata"}
          unloadOnExit
          className="h-full w-full"
        />
      </div>

      {/* Bottom author block */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pb-24 pt-24 text-white">
        <div className="pointer-events-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pr-16">
          <Link to="/u/$username" params={{ username: reel.author.username }} className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0">
              <AvatarImage path={reel.author.avatar_url} name={reel.author.display_name ?? reel.author.username} size={40} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{reel.author.display_name ?? reel.author.username}</span>
              {(reel.audio_title || reel.audio_artist) && (
                <span className="flex items-center gap-1 truncate text-xs text-white/80">
                  <Music2 className="h-3 w-3 shrink-0" />
                  {[reel.audio_title, reel.audio_artist].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </Link>
          {!isOwn && user && (
            <button
              onClick={() => toggleFollow.mutate()}
              className="shrink-0 rounded-full border border-white/70 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {reel.caption && <p className="pointer-events-auto mt-3 line-clamp-2 whitespace-pre-wrap pr-16 text-sm text-white/95">{reel.caption}</p>}
      </div>

      {/* Right action rail */}
      <div className="absolute bottom-32 right-3 flex flex-col items-center gap-5 text-white">
        <RailButton
          label={compact(likeState?.count ?? 0)}
          onClick={() => (user ? toggleLike.mutate() : toast.info("Sign in to react"))}
          ariaLabel="Like reel"
        >
          <Heart className={`h-7 w-7 drop-shadow-lg ${likeState?.liked ? "fill-rose-500 text-rose-500" : ""}`} strokeWidth={1.8} />
        </RailButton>

        <Link to="/p/$postId" params={{ postId: reel.id }} className="flex flex-col items-center gap-1" aria-label="Comment on reel">
          <MessageCircle className="h-7 w-7 drop-shadow-lg" strokeWidth={1.8} />
          <span className="text-xs font-semibold drop-shadow">{compact(commentCount)}</span>
        </Link>

        <RailButton label="Share" onClick={share} ariaLabel="Share reel">
          <Share2 className="h-7 w-7 drop-shadow-lg" strokeWidth={1.8} />
        </RailButton>

        <RailButton
          label="Save"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${window.location.origin}/p/${reel.id}`);
              toast.success("Reel link saved to clipboard");
            } catch {
              toast.error("Could not save reel");
            }
          }}
          ariaLabel="Save reel"
        >
          <Bookmark className="h-7 w-7 drop-shadow-lg" strokeWidth={1.8} />
        </RailButton>

        <RailButton label="" onClick={share} ariaLabel="More options">
          <MoreHorizontal className="h-6 w-6 drop-shadow-lg" />
        </RailButton>
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
    <button onClick={onClick} aria-label={ariaLabel} className="flex flex-col items-center gap-1">
      {children}
      {label && <span className="text-xs font-semibold drop-shadow">{label}</span>}
    </button>
  );
}
