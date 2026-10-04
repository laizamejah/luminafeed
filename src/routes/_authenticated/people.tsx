import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { AvatarImage } from "@/components/avatar-image";
import { Button } from "@/components/ui/button";
import { useFollowUser, useSuggestions } from "@/components/suggested-friends";

export const Route = createFileRoute("/_authenticated/people")({
  head: () => ({
    meta: [
      { title: "Discover people · Lumina" },
      { name: "description", content: "Find and follow photographers on Lumina." },
      { property: "og:title", content: "Discover people · Lumina" },
      { property: "og:description", content: "Find and follow photographers on Lumina." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PeoplePage,
});

function PeoplePage() {
  const router = useRouter();
  const { data = [], isLoading } = useSuggestions(500);
  const follow = useFollowUser();
  const [gone, setGone] = useState<string[]>([]);
  const list = data.filter((p) => !gone.includes(p.id));

  return (
    <div className="mx-auto max-w-xl pb-8">
      <div className="sticky top-0 z-10 flex items-center bg-background px-2 py-3">
        <button onClick={() => router.history.back()} aria-label="Back" className="p-2"><ChevronLeft className="h-6 w-6" /></button>
        <h1 className="flex-1 pr-10 text-center text-base font-semibold">Discover people</h1>
      </div>
      <h2 className="px-4 pb-2 pt-3 text-[15px] font-semibold">Suggested for you</h2>
      {isLoading && <p className="px-4 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && list.length === 0 && <p className="px-4 text-sm text-muted-foreground">You're following everyone on Lumina.</p>}
      <ul>
        {list.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <Link to="/u/$username" params={{ username: p.username }}>
              <AvatarImage path={p.avatar_url} name={p.display_name ?? p.username} size={56} />
            </Link>
            <Link to="/u/$username" params={{ username: p.username }} className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.display_name || p.username}</p>
              <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
            </Link>
            <Button size="sm" className="w-24 rounded-lg" disabled={follow.isPending}
              onClick={() => follow.mutate(p.id, { onSuccess: () => setGone((g) => [...g, p.id]) })}>
              Follow
            </Button>
            <button aria-label="Dismiss" onClick={() => setGone((g) => [...g, p.id])} className="p-1"><X className="h-5 w-5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
