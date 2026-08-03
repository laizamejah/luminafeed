import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PostCard, type FeedPost } from "@/components/post-card";
import { CommentsPanel } from "@/components/comments-panel";

export const Route = createFileRoute("/p/$postId")({
  ssr: false,
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();

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

  if (!post) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <PostCard post={post} />
      {post.comments_enabled ? (
        <div className="flex min-h-[50vh] flex-col py-4">
          <h2 className="mb-2 px-4 font-serif text-lg">Comments</h2>
          <CommentsPanel postId={post.id} postOwnerId={post.user_id} />
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground md:px-0">
          Comments are off for this post.
        </div>
      )}
    </div>
  );
}
