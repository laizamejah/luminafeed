import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PostCard, type FeedPost } from "@/components/post-card";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AvatarImage } from "@/components/avatar-image";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$postId")({
  ssr: false,
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const { data: post } = useQuery({
    queryKey: ["post", postId],
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select(`
        id, caption, created_at, latitude, longitude, location_name,
        comments_enabled, is_reel, user_id,
        author:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, show_metrics_publicly),
        media:post_media (id, storage_path, media_type, width, height, position)
      `).eq("id", postId).maybeSingle();
      if (error) throw error;
      return data as unknown as FeedPost | null;
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["comments", postId],
    enabled: !!post,
    queryFn: async () => {
      const { data } = await supabase.from("comments")
        .select("id, content, created_at, user_id, author:profiles!comments_user_id_fkey (username, display_name, avatar_url)")
        .eq("post_id", postId).order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!user || !text.trim()) return;
      const trimmed = text.trim();
      const { data: inserted, error } = await supabase.from("comments").insert({ post_id: postId, user_id: user.id, content: trimmed }).select("id").maybeSingle();
      if (error) throw error;
      // create a notification for the post owner (skip notifying self)
      try {
        if (post && post.user_id !== user.id) {
          await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, type: "comment", data: { post_id: postId, comment_id: inserted?.id, text: trimmed.slice(0, 200) } });
        }
      } catch (e) {
        // don't block comment on notification failure
      }
    },
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["comments", postId] }); },
  });

  if (!post) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <PostCard post={post} />
      {post.comments_enabled ? (
        <div className="px-4 py-6 md:px-0">
          <h2 className="font-serif text-lg mb-4">Comments</h2>
          <div className="space-y-4">
            {comments?.map((c) => {
              const author = c.author as unknown as { username: string; display_name: string | null; avatar_url: string | null };
              return (
                <div key={c.id} className="flex gap-3">
                  <Link to="/u/$username" params={{ username: author.username }}>
                    <AvatarImage path={author.avatar_url} name={author.display_name ?? author.username} size={32} />
                  </Link>
                  <div className="flex-1 text-sm">
                    <Link to="/u/$username" params={{ username: author.username }} className="font-medium mr-2">{author.username}</Link>
                    {c.content}
                    <div className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</div>
                  </div>
                </div>
              );
            })}
            {comments?.length === 0 && <p className="text-sm text-muted-foreground">Be the first to comment.</p>}
          </div>
          {user && (
            <div className="mt-6 flex gap-2">
              <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" maxLength={2000} />
              <Button onClick={() => add.mutate()} disabled={!text.trim() || add.isPending}>Post</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-6 md:px-0 text-center text-sm text-muted-foreground">
          Comments are off for this post.
        </div>
      )}
    </div>
  );
}
