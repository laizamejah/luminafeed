import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchFeed, type FeedScope } from "@/lib/feed";
import { PostCard } from "@/components/post-card";
import { PostComposer } from "@/components/post-composer";
import { StoriesBar } from "@/components/stories-bar";
import { SuggestedFriends } from "@/components/suggested-friends";

import { useCurrentUser, useCurrentProfile } from "@/hooks/use-current-user";
import { AvatarImage } from "@/components/avatar-image";

export const Route = createFileRoute("/_authenticated/feed")({
  component: FeedPage,
});

const SCOPES: { id: FeedScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "close_friends", label: "Close friends" },
];

function FeedPage() {
  const { data: user } = useCurrentUser();
  const { data: me } = useCurrentProfile();
  const hideReels = me?.hide_reels ?? false;
  const kidOnly = me?.is_kid ?? false;
  const [scope, setScope] = useState<FeedScope>("all");
  const compact = me?.feed_layout === "compact";

  const { data: posts, isLoading } = useQuery({
    queryKey: ["feed", user?.id ?? null, hideReels, kidOnly, scope],
    queryFn: () => fetchFeed(user?.id ?? null, hideReels, kidOnly, scope),
  });

  return (
    <div className={compact ? "mx-auto max-w-xl" : "mx-auto max-w-2xl"}>
      <div className="sticky top-0 md:top-0 z-10 bg-background/85 backdrop-blur border-b border-border">
        <div className="hidden md:flex items-baseline justify-between px-4 py-6">
          <h1 className="font-serif text-3xl">Feed</h1>
          <span className="text-xs text-muted-foreground">Chronological · no algorithm</span>
        </div>
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-3 py-2">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                scope === s.id ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-secondary/60"
              }`}
            >
              {s.label}
            </button>
          ))}
          <Link
            to="/albums"
            className="shrink-0 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary/60"
          >
            Custom lists
          </Link>
        </div>
      </div>

      {me && (
        <PostComposer />
      )}

      <StoriesBar />

      {isLoading && (
        <div className="space-y-8 p-4">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              </div>
              <div className="aspect-[4/5] w-full bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && posts?.length === 0 && (
        <div className="p-12 text-center">
          <p className="font-serif text-xl">Nothing here yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">Share your first frame.</p>
        </div>
      )}

      <div>
        {posts?.map((p, i) => (
          <div key={p.id}>
            <PostCard post={p} />
            {i === 2 && <SuggestedFriends />}
          </div>
        ))}
        {!isLoading && (posts?.length ?? 0) <= 2 && <SuggestedFriends />}
      </div>

    </div>
  );
}
