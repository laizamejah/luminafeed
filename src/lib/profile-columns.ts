// Public-safe profile columns. Child-safety fields (birth year, kid status,
// guardian link) live in the restricted `profile_safety` table instead.
export const PROFILE_SELECT =
  "id, username, display_name, avatar_url, bio, show_metrics_publicly, hide_reels, created_at, theme_preference, message_notifications, suspended, suspended_at, suspension_reason, cover_url, cover_position, accent_color, feed_layout, hide_public_counts, location, hometown, relationship_status, education, category, verified";
