import { supabase } from "@/integrations/supabase/client";
import type { FeedPost } from "@/components/post-card";

const SELECT = `
  id, caption, created_at, latitude, longitude, location_name,
  comments_enabled, is_reel, user_id,
  audio_preview_url, audio_title, audio_artist, audio_artwork_url,
  author:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, show_metrics_publicly),
  media:post_media (id, storage_path, media_type, width, height, thumbnail_path, position, exif)
`;

export type FeedScope = "all" | "following" | "close_friends";

async function followingIds(userId: string, closeOnly: boolean): Promise<string[]> {
  let q = supabase.from("follows").select("following_id").eq("follower_id", userId);
  if (closeOnly) q = q.eq("tier", "close_friend");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => r.following_id as string);
}

export async function fetchFeed(
  userId: string | null,
  hideReels: boolean,
  kidOnly = false,
  scope: FeedScope = "all",
): Promise<FeedPost[]> {
  let query = supabase
    .from("posts")
    .select(SELECT)
    // Strictly chronological — newest first, no ranking or algorithmic sorting.
    .order("created_at", { ascending: false })
    .limit(80);

  if (hideReels) query = query.eq("is_reel", false);
  if (kidOnly) query = query.eq("kid_safe", true);

  if (scope !== "all" && userId) {
    const ids = await followingIds(userId, scope === "close_friends");
    const authors = [...new Set([...ids, userId])];
    query = query.in("user_id", authors);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as FeedPost[];
}

export async function fetchGeoPosts(): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(SELECT)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as FeedPost[];
}

/** Unified chronological timeline of every post contributed to a shared album. */
export async function fetchAlbumFeed(albumId: string): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("album_posts")
    .select(`post_id, created_at, post:posts (${SELECT})`)
    .eq("album_id", albumId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { post: FeedPost | null }[])
    .map((r) => r.post)
    .filter((p): p is FeedPost => !!p);
}

/** Chronological posts authored by a single user, shaped for <PostCard />. */
export async function fetchUserPosts(userId: string): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as unknown as FeedPost[];
}
