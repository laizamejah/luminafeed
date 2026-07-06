import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Send, MapPin, ThumbsDown, Share2, Music, Play, Pause, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useCurrentProfile } from "@/hooks/use-current-user";
import { AvatarImage } from "./avatar-image";
import { PostMedia } from "./post-media";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";

export interface FeedPost {
  id: string;
  caption: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  comments_enabled: boolean;
  is_reel: boolean;
  user_id: string;
  audio_preview_url: string | null;
  audio_title: string | null;
  audio_artist: string | null;
  audio_artwork_url: string | null;
  author: { id: string; username: string; display_name: string | null; avatar_url: string | null; show_metrics_publicly: boolean };
  media: { id: string; storage_path: string; media_type: "image" | "video"; width: number | null; height: number | null; thumbnail_path: string | null; position: number }[];
}

export function PostCard({ post }: { post: FeedPost }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: me } = useCurrentProfile();
  const [idx, setIdx] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const media = [...post.media].sort((a, b) => a.position - b.position);
  const isOwnPost = user?.id === post.user_id;
  const showMetrics = post.author.show_metrics_publicly || isOwnPost;

  // Music player — auto-play muted then unmute on first interaction; auto-play when card visible
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!post.audio_preview_url || !cardRef.current) return;
    const el = cardRef.current;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!audioRef.current) return;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
        } else {
          audioRef.current.pause();
          setPlaying(false);
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [post.audio_preview_url]);

  const { data: likeState } = useQuery({
    queryKey: ["likes", post.id, user?.id],
    queryFn: async () => {
      const [countRes, meRes] = await Promise.all([
        supabase.from("likes").select("*", { count: "exact", head: true }).eq("post_id", post.id),
        user ? supabase.from("likes").select("post_id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return { count: countRes.count ?? 0, liked: !!meRes.data };
    },
  });

  const { data: dislikeState } = useQuery({
    queryKey: ["dislikes", post.id, user?.id],
    queryFn: async () => {
      const [countRes, meRes] = await Promise.all([
        supabase.from("dislikes").select("*", { count: "exact", head: true }).eq("post_id", post.id),
        user ? supabase.from("dislikes").select("post_id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return { count: countRes.count ?? 0, disliked: !!meRes.data };
    },
  });

  const { data: commentCount } = useQuery({
    queryKey: ["comments-count", post.id],
    queryFn: async () => {
      const { count } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", post.id);
      return count ?? 0;
    },
  });

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (likeState?.liked) {
        await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      } else {
        await supabase.from("likes").insert({ post_id: post.id, user_id: user.id });
        // create notification for post owner (don't notify self)
        if (post.user_id !== user.id) {
          await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, type: "like", data: { post_id: post.id } });
        }
        if (dislikeState?.disliked) await supabase.from("dislikes").delete().eq("post_id", post.id).eq("user_id", user.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["likes", post.id] });
      qc.invalidateQueries({ queryKey: ["dislikes", post.id] });
    },
  });

  const toggleDislike = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (dislikeState?.disliked) {
        await supabase.from("dislikes").delete().eq("post_id", post.id).eq("user_id", user.id);
      } else {
        await supabase.from("dislikes").insert({ post_id: post.id, user_id: user.id });
        if (post.user_id !== user.id) {
          await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, type: "dislike", data: { post_id: post.id } });
        }
        if (likeState?.liked) await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["likes", post.id] });
      qc.invalidateQueries({ queryKey: ["dislikes", post.id] });
    },
  });

  async function share() {
    const url = `${window.location.origin}/p/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `@${post.author.username} on Lumina`, url });
        return;
      } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not share");
    }
  }

  function toggleMusic() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
  }

  return (
    <article ref={cardRef} className="mx-auto w-full max-w-2xl border-b border-border/60 py-5 sm:py-6">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3 px-3 sm:px-4">
        <Link to="/u/$username" params={{ username: post.author.username }}>
          <AvatarImage path={post.author.avatar_url} name={post.author.display_name ?? post.author.username} size={40} />
        </Link>
        <div className="flex-1 min-w-0">
          <Link to="/u/$username" params={{ username: post.author.username }} className="font-medium text-sm hover:underline">
            {post.author.display_name || post.author.username}
          </Link>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>@{post.author.username}</span>
            <span>·</span>
            <time>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</time>
            {post.location_name && (<><span>·</span><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{post.location_name}</span></>)}
          </div>
        </div>
      </div>

      {/* Media */}
      {media.length > 0 && (
        <div className="relative mx-3 overflow-hidden rounded-[1.35rem] border border-border/60 bg-muted shadow-sm sm:mx-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setViewerOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setViewerOpen(true);
              }
            }}
            className="cursor-zoom-in"
          >
            <PostMedia
              path={media[idx].storage_path}
              type={media[idx].media_type}
              width={media[idx].width}
              height={media[idx].height}
              thumbnailPath={media[idx].thumbnail_path}
              autoplayOnView={media[idx].media_type === "video"}
              preload="metadata"
              unloadOnExit
            />
          </div>
          {media.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {media.map((_, i) => (
                <span key={i} className={`h-1 w-6 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/40"}`} />
              ))}
            </div>
          )}
          {media.length > 1 && (
            <>
              {idx > 0 && <button onClick={() => setIdx(idx - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 backdrop-blur px-3 py-1 text-sm">‹</button>}
              {idx < media.length - 1 && <button onClick={() => setIdx(idx + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 backdrop-blur px-3 py-1 text-sm">›</button>}
            </>
          )}
        </div>
      )}

      {/* Music strip */}
      {post.audio_preview_url && (
        <div className="mt-3 mx-3 flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/40 px-3 py-2 sm:mx-4">
          {post.audio_artwork_url ? (
            <img src={post.audio_artwork_url} alt="" className="h-9 w-9 rounded" />
          ) : (
            <div className="h-9 w-9 rounded bg-muted flex items-center justify-center"><Music className="h-4 w-4" /></div>
          )}
          <div className="flex-1 min-w-0 text-xs">
            <div className="truncate font-medium">{post.audio_title}</div>
            <div className="truncate text-muted-foreground">{post.audio_artist}</div>
          </div>
          <button onClick={toggleMusic} aria-label={playing ? "Pause" : "Play"} className="rounded-full bg-foreground text-background p-2">
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <audio ref={audioRef} src={post.audio_preview_url} loop preload="none" onEnded={() => setPlaying(false)} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-4 px-3 sm:px-4">
        <button
          onClick={() => user ? toggleLike.mutate() : toast.info("Sign in to react")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Like"
        >
          <Heart className={`h-5 w-5 ${likeState?.liked ? "fill-[color:var(--ochre)] text-[color:var(--ochre)]" : ""}`} />
          {showMetrics && <span className="tabular-nums">{likeState?.count ?? 0}</span>}
        </button>

        <button
          onClick={() => user ? toggleDislike.mutate() : toast.info("Sign in to react")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Dislike"
        >
          <ThumbsDown className={`h-5 w-5 ${dislikeState?.disliked ? "fill-current" : ""}`} />
          {showMetrics && <span className="tabular-nums">{dislikeState?.count ?? 0}</span>}
        </button>

        {post.comments_enabled ? (
          <Link to="/p/$postId" params={{ postId: post.id }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" aria-label="Comment">
            <MessageCircle className="h-5 w-5" />
            {showMetrics && <span className="tabular-nums">{commentCount ?? 0}</span>}
          </Link>
        ) : me && me.id !== post.user_id ? (
          <Link to="/messages/$userId" params={{ userId: post.user_id }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Send className="h-5 w-5" /><span className="text-xs">DM privately</span>
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground/60"><MessageCircle className="h-5 w-5" /><span className="text-xs">Comments off</span></span>
        )}

        <button onClick={share} className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" aria-label="Share">
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* Caption */}
      {post.caption && (
        <p className="mt-3 whitespace-pre-wrap px-3 text-sm sm:px-4">
          <Link to="/u/$username" params={{ username: post.author.username }} className="font-medium mr-2">{post.author.username}</Link>
          {post.caption}
        </p>
      )}

      {viewerOpen && (
        <MediaDetailOverlay
          post={post}
          media={media}
          idx={idx}
          setIdx={setIdx}
          liked={!!likeState?.liked}
          likeCount={likeState?.count ?? 0}
          onLike={() => user ? toggleLike.mutate() : toast.info("Sign in to react")}
          showMetrics={showMetrics}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </article>
  );
}

function MediaDetailOverlay({
  post, media, idx, setIdx, liked, likeCount, onLike, showMetrics, onClose,
}: {
  post: FeedPost;
  media: FeedPost["media"];
  idx: number;
  setIdx: (fn: (prev: number) => number) => void;
  liked: boolean;
  likeCount: number;
  onLike: () => void;
  showMetrics: boolean;
  onClose: () => void;
}) {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const { data: comments } = useQuery({
    queryKey: ["comments", post.id],
    enabled: post.comments_enabled,
    queryFn: async () => {
      const { data } = await supabase.from("comments")
        .select("id, content, created_at, user_id, author:profiles!comments_user_id_fkey (username, display_name, avatar_url)")
        .eq("post_id", post.id).order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!user || !text.trim()) return;
      const trimmed = text.trim();
      const { data: inserted, error } = await supabase.from("comments")
        .insert({ post_id: post.id, user_id: user.id, content: trimmed })
        .select("id").maybeSingle();
      if (error) throw error;
      if (post.user_id !== user.id) {
        try {
          await supabase.from("notifications").insert({
            user_id: post.user_id, actor_id: user.id, type: "comment",
            data: { post_id: post.id, comment_id: inserted?.id, text: trimmed.slice(0, 200) },
          });
        } catch { /* ignore */ }
      }
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["comments", post.id] });
      qc.invalidateQueries({ queryKey: ["comments-count", post.id] });
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 md:flex-row" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 z-20 rounded-full bg-black/70 p-2 text-white" aria-label="Close">
        <X className="h-5 w-5" />
      </button>

      {/* Media pane */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {media.length > 1 && (
          <button
            onClick={() => setIdx((p) => (p > 0 ? p - 1 : media.length - 1))}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white"
            aria-label="Previous"
          >‹</button>
        )}
        <div className="relative flex h-full w-full items-center justify-center p-2 md:p-4">
          <PostMedia
            path={media[idx].storage_path}
            type={media[idx].media_type}
            width={media[idx].width}
            height={media[idx].height}
            thumbnailPath={media[idx].thumbnail_path}
            autoplayOnView={media[idx].media_type === "video"}
            preload="auto"
            unloadOnExit={false}
            className="h-full max-h-full w-full"
          />
        </div>
        {media.length > 1 && (
          <button
            onClick={() => setIdx((p) => (p < media.length - 1 ? p + 1 : 0))}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white"
            aria-label="Next"
          >›</button>
        )}
      </div>

      {/* Info + comments pane */}
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[45vh] w-full flex-col border-t border-border bg-background md:max-h-none md:h-full md:w-[380px] md:border-l md:border-t-0"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Link to="/u/$username" params={{ username: post.author.username }}>
            <AvatarImage path={post.author.avatar_url} name={post.author.display_name ?? post.author.username} size={36} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link to="/u/$username" params={{ username: post.author.username }} className="block truncate text-sm font-medium hover:underline">
              {post.author.display_name || post.author.username}
            </Link>
            <div className="truncate text-xs text-muted-foreground">
              @{post.author.username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </div>
          </div>
        </div>

        {post.caption && (
          <p className="whitespace-pre-wrap border-b border-border px-4 py-3 text-sm">
            {post.caption}
          </p>
        )}

        <div className="flex items-center gap-4 border-b border-border px-4 py-2">
          <button onClick={onLike} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" aria-label="Like">
            <Heart className={`h-5 w-5 ${liked ? "fill-[color:var(--ochre)] text-[color:var(--ochre)]" : ""}`} />
            {showMetrics && <span className="tabular-nums">{likeCount}</span>}
          </button>
          {post.comments_enabled && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageCircle className="h-5 w-5" />
              <span className="tabular-nums">{comments?.length ?? 0}</span>
            </span>
          )}
        </div>

        {post.comments_enabled ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {comments?.length === 0 && (
                <p className="text-sm text-muted-foreground">Be the first to comment.</p>
              )}
              {comments?.map((c) => {
                const author = c.author as unknown as { username: string; display_name: string | null; avatar_url: string | null };
                return (
                  <div key={c.id} className="flex gap-2.5">
                    <AvatarImage path={author.avatar_url} name={author.display_name ?? author.username} size={28} />
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="mr-2 font-medium">{author.username}</span>
                      <span className="break-words">{c.content}</span>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {user && (
              <div className="flex gap-2 border-t border-border px-3 py-2">
                <Textarea
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addComment.mutate();
                    }
                  }}
                  placeholder="Add a comment…"
                  className="min-h-9 resize-none"
                  maxLength={2000}
                />
                <Button size="sm" onClick={() => addComment.mutate()} disabled={!text.trim() || addComment.isPending}>
                  Post
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 p-4 text-center text-sm text-muted-foreground">
            Comments are off for this post.
          </div>
        )}
      </aside>
    </div>
  );
}
