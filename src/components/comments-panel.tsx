import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { AvatarImage } from "./avatar-image";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Heart, ImagePlus, Smile, Sticker, X, Loader2 } from "lucide-react";

const EMOJIS = ["😀","😂","🥰","😍","😎","🤩","😭","😡","👍","👏","🙏","🔥","💯","🎉","❤️","💔","✨","😅","🤔","😴","🥳","😇","🤝","👀"];
const STICKERS = ["🐣","🐳","🦄","🌈","🍕","🌻","🚀","🎸","🏆","💎","🌙","☕️","🐶","🐱","🍿","⚡️"];

export interface CommentRow {
  id: string;
  content: string | null;
  media_url: string | null;
  media_kind: string | null;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  like_count: number;
  liked_by_me: boolean;
  author: { username: string; display_name: string | null; avatar_url: string | null };
}

function CommentMedia({ url, kind }: { url: string; kind: string | null }) {
  const isUpload = kind === "upload";
  const { data: signed } = useSignedUrl("media", isUpload ? url : null);
  if (kind === "sticker") return <span className="block text-5xl leading-none">{url}</span>;
  const src = isUpload ? signed : url;
  if (!src) return <div className="h-32 w-32 animate-pulse rounded-lg bg-muted" />;
  return <img src={src} alt="Comment attachment" className="mt-1 max-h-52 w-auto max-w-full rounded-lg object-contain" loading="lazy" />;
}

export function CommentsPanel({
  postId,
  postOwnerId,
  onNavigate,
  className = "",
}: {
  postId: string;
  postOwnerId: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<"emoji" | "sticker" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingSticker, setPendingSticker] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommentRow | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, content, media_url, media_kind, created_at, user_id, parent_id, author:profiles!comments_user_id_fkey (username, display_name, avatar_url)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Omit<CommentRow, "like_count" | "liked_by_me">[];
      if (rows.length === 0) return [] as CommentRow[];
      const { data: likes, error: likesError } = await supabase
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", rows.map((row) => row.id));
      if (likesError) throw likesError;
      return rows.map((row) => ({
        ...row,
        like_count: (likes ?? []).filter((like) => like.comment_id === row.id).length,
        liked_by_me: !!user && (likes ?? []).some((like) => like.comment_id === row.id && like.user_id === user.id),
      }));
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to comment");
      const trimmed = text.trim();
      if (!trimmed && !pendingFile && !pendingSticker) return;

      let mediaUrl: string | null = null;
      let mediaKind: string | null = null;

      if (pendingSticker) {
        mediaUrl = pendingSticker;
        mediaKind = "sticker";
      } else if (pendingFile) {
        const ext = pendingFile.name.split(".").pop() || "bin";
        const path = `${user.id}/comments/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, pendingFile, { contentType: pendingFile.type });
        if (upErr) throw upErr;
        mediaUrl = path;
        mediaKind = "upload";
      }

      const { data: inserted, error } = await supabase
        .from("comments")
        .insert({ post_id: postId, user_id: user.id, parent_id: replyingTo?.parent_id ?? replyingTo?.id ?? null, content: trimmed, media_url: mediaUrl, media_kind: mediaKind })
        .select("id")
        .maybeSingle();
      if (error) throw error;

      if (postOwnerId !== user.id) {
        try {
          await supabase.from("notifications").insert({
            user_id: postOwnerId,
            actor_id: user.id,
            type: replyingTo ? "comment_reply" : "comment",
            data: { post_id: postId, comment_id: inserted?.id, parent_id: replyingTo?.id, text: trimmed.slice(0, 200) },
          });
        } catch { /* ignore */ }
      }
    },
    onSuccess: () => {
      setText("");
      setPendingFile(null);
      setPendingSticker(null);
      setPicker(null);
      setReplyingTo(null);
      qc.invalidateQueries({ queryKey: ["comments", postId] });
      qc.invalidateQueries({ queryKey: ["comments-count", postId] });
      qc.invalidateQueries({ queryKey: ["reel-comments", postId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not comment"),
  });

  const toggleCommentLike = useMutation({
    mutationFn: async (comment: CommentRow) => {
      if (!user) throw new Error("Sign in to like comments");
      const result = comment.liked_by_me
        ? await supabase.from("comment_likes").delete().eq("comment_id", comment.id).eq("user_id", user.id)
        : await supabase.from("comment_likes").insert({ comment_id: comment.id, user_id: user.id });
      if (result.error) throw result.error;
      if (!comment.liked_by_me && comment.user_id !== user.id) {
        await supabase.from("notifications").insert({ user_id: comment.user_id, actor_id: user.id, type: "comment_like", data: { post_id: postId, comment_id: comment.id } });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", postId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not like comment"),
  });

  const parents = comments.filter((comment) => !comment.parent_id);
  const repliesFor = (parentId: string) => comments.filter((comment) => comment.parent_id === parentId);

  function renderComment(c: CommentRow, isReply = false) {
    return (
      <div key={c.id} className={`flex gap-2.5 ${isReply ? "ml-9 border-l border-border pl-3" : ""}`}>
        <Link to="/u/$username" params={{ username: c.author.username }} onClick={onNavigate} className="shrink-0">
          <AvatarImage path={c.author.avatar_url} name={c.author.display_name ?? c.author.username} size={isReply ? 24 : 30} />
        </Link>
        <div className="min-w-0 flex-1 text-sm">
          <div className="rounded-2xl bg-secondary/70 px-3 py-2">
            <Link to="/u/$username" params={{ username: c.author.username }} onClick={onNavigate} className="mr-2 font-semibold hover:underline">{c.author.username}</Link>
            {c.content && <span className="break-words">{c.content}</span>}
            {c.media_url && <CommentMedia url={c.media_url} kind={c.media_kind} />}
          </div>
          <div className="mt-1 flex items-center gap-3 px-2 text-[11px] text-muted-foreground">
            <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
            <Button type="button" variant="link" className="h-auto p-0 text-[11px] font-semibold text-muted-foreground" onClick={() => setReplyingTo(c)}>Reply</Button>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => toggleCommentLike.mutate(c)} className="mt-1 h-9 w-9 shrink-0" aria-label={c.liked_by_me ? "Unlike comment" : "Like comment"}>
          <span className="flex flex-col items-center"><Heart className={`h-4 w-4 ${c.liked_by_me ? "fill-destructive text-destructive" : ""}`} />{c.like_count > 0 && <span className="text-[9px] tabular-nums">{c.like_count}</span>}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading comments…</p>}
        {!isLoading && comments.length === 0 && <p className="text-sm text-muted-foreground">Be the first to comment.</p>}
        {parents.map((comment) => (
          <div key={comment.id} className="space-y-3">
            {renderComment(comment)}
            {repliesFor(comment.id).map((reply) => renderComment(reply, true))}
          </div>
        ))}
      </div>

      {user ? (
        <div className="border-t border-border px-3 py-2">
          {replyingTo && (
            <div className="mb-2 flex items-center rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              Replying to <span className="ml-1 font-semibold text-foreground">@{replyingTo.author.username}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => setReplyingTo(null)} className="ml-auto h-6 w-6" aria-label="Cancel reply"><X className="h-3.5 w-3.5" /></Button>
            </div>
          )}
          {(pendingFile || pendingSticker) && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-secondary/60 px-2 py-1.5 text-xs">
              {pendingSticker ? <span className="text-2xl">{pendingSticker}</span> : <span className="truncate">{pendingFile?.name}</span>}
              <button
                onClick={() => { setPendingFile(null); setPendingSticker(null); }}
                className="ml-auto rounded-full p-1 hover:bg-secondary"
                aria-label="Remove attachment"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {picker && (
            <div className="mb-2 grid max-h-32 grid-cols-8 gap-1 overflow-y-auto rounded-lg border border-border p-2">
              {(picker === "emoji" ? EMOJIS : STICKERS).map((e) => (
                <button
                  key={e}
                  className="rounded p-1 text-xl hover:bg-secondary"
                  onClick={() => {
                    if (picker === "emoji") setText((t) => t + e);
                    else { setPendingSticker(e); setPendingFile(null); setPicker(null); }
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,image/gif,video/mp4"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setPendingFile(f); setPendingSticker(null); }
                e.target.value = "";
              }}
            />
            <button onClick={() => fileRef.current?.click()} aria-label="Attach image or GIF" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <ImagePlus className="h-5 w-5" />
            </button>
            <button onClick={() => setPicker(picker === "emoji" ? null : "emoji")} aria-label="Emoji" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Smile className="h-5 w-5" />
            </button>
            <button onClick={() => setPicker(picker === "sticker" ? null : "sticker")} aria-label="Stickers" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Sticker className="h-5 w-5" />
            </button>
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
              placeholder={replyingTo ? `Reply to @${replyingTo.author.username}…` : "Join the conversation…"}
              className="min-h-9 resize-none"
              maxLength={2000}
            />
            <Button
              size="sm"
              onClick={() => addComment.mutate()}
              disabled={addComment.isPending || (!text.trim() && !pendingFile && !pendingSticker)}
            >
              {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-3 text-center text-sm text-muted-foreground">Sign in to comment.</div>
      )}
    </div>
  );
}
