import { supabase } from "@/integrations/supabase/client";

export interface FollowerNotificationPayload {
  type: string;
  targetId: string;
  targetType: string;
  body: string;
  href: string;
  data?: Record<string, unknown>;
}

export async function notifyFollowers(actorId: string, payload: FollowerNotificationPayload) {
  const { data: followersData, error: followersError } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("following_id", actorId);

  if (followersError) throw followersError;

  const followerIds = (followersData ?? [])
    .map((row) => row.follower_id)
    .filter((id): id is string => Boolean(id) && id !== actorId);

  if (followerIds.length === 0) return;

  const rows = followerIds.map((followerId) => ({
    user_id: followerId,
    actor_id: actorId,
    type: payload.type,
    data: {
      target_id: payload.targetId,
      target_type: payload.targetType,
      body: payload.body,
      href: payload.href,
      ...(payload.data ?? {}),
    },
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) throw error;
}

export async function notifyStorySummary(ownerId: string, storyId: string, views: number, reactions: number) {
  const { data: existingRows, error: existingError } = await supabase
    .from("notifications")
    .select("id, data")
    .eq("user_id", ownerId)
    .eq("type", "story_expired");

  if (existingError) throw existingError;
  const seen = (existingRows ?? []).some((row) => (row.data as Record<string, unknown> | null)?.story_id === storyId);
  if (seen) return;

  const { error } = await supabase.from("notifications").insert({
    user_id: ownerId,
    actor_id: ownerId,
    type: "story_expired",
    data: {
      story_id: storyId,
      views,
      reactions,
      body: `Your story had ${views} views and ${reactions} reactions before it expired.`,
      href: "/feed",
    },
  });

  if (error) throw error;
}
