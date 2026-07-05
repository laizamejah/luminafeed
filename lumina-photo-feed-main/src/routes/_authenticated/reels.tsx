import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useCurrentProfile } from "@/hooks/use-current-user";
import { PostMedia } from "@/components/post-media";
import { AvatarImage } from "@/components/avatar-image";
import { Heart, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/reels")({
  component: ReelsPage,
});

interface Reel {
  id: string;
  caption: string | null;
  user_id: string;
  author: { id: string; username: string; display_name: string | null; avatar_url: string | null };
  media: { storage_path: string; media_type: "image" | "video"; width: number | null; height: number | null; thumbnail_path: string | null; position: number }[];
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
        .select(`id, caption, user_id,
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
    <div className="h-[calc(100dvh-5rem)] overflow-y-auto overflow-x-hidden bg-black snap-y snap-mandatory md:h-screen">
      {reels.map((r) => <ReelItem key={r.id} reel={r} />)}
    </div>
  );
}

function ReelItem({ reel }: { reel: Reel }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const media = [...reel.media].sort((a, b) => a.position - b.position)[0];
  const isMobile = useIsMobile();

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
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-black snap-start md:h-screen">
      <div className="relative h-full w-full max-w-[480px]">
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
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-6 text-white">
        <Link to="/u/$username" params={{ username: reel.author.username }} className="flex items-center gap-3">
          <AvatarImage path={reel.author.avatar_url} name={reel.author.display_name ?? reel.author.username} size={36} />
          <span className="font-medium">@{reel.author.username}</span>
        </Link>
        {reel.caption && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm">{reel.caption}</p>}
      </div>
      <div className="absolute bottom-24 right-4 flex flex-col items-center gap-3 text-white">
        <button
          onClick={() => (user ? toggleLike.mutate() : toast.info("Sign in to react"))}
          className="rounded-full bg-white/10 p-3 backdrop-blur"
          aria-label="Like reel"
        >
          <Heart className={`h-5 w-5 ${likeState?.liked ? "fill-current text-rose-500" : ""}`} />
        </button>
        <span className="text-xs font-medium">{likeState?.count ?? 0}</span>

        <Link to="/p/$postId" params={{ postId: reel.id }} className="rounded-full bg-white/10 p-3 backdrop-blur" aria-label="Comment on reel">
          <MessageCircle className="h-5 w-5" />
        </Link>
        <span className="text-xs font-medium">{commentCount}</span>

        <button onClick={share} className="rounded-full bg-white/10 p-3 backdrop-blur" aria-label="Share reel">
          <Share2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
