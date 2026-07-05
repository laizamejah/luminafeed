import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchGeoPosts } from "@/lib/feed";
import { PostMedia } from "@/components/post-media";
import { AvatarImage } from "@/components/avatar-image";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { FeedPost } from "@/components/post-card";

export const Route = createFileRoute("/_authenticated/discover")({
  ssr: false,
  component: DiscoverPage,
});

function DiscoverPage() {
  const { data: posts } = useQuery({ queryKey: ["geo-posts"], queryFn: fetchGeoPosts });
  const [selected, setSelected] = useState<FeedPost | null>(null);
  const [Map, setMap] = useState<null | typeof import("@/components/discover-map")>(null);

  useEffect(() => {
    import("@/components/discover-map").then(setMap);
  }, []);

  return (
    <div className="relative h-[calc(100vh-3.5rem)] md:h-screen">
      <div className="absolute inset-x-0 top-0 z-10 flex items-baseline justify-between border-b border-border bg-background/85 backdrop-blur px-6 py-4">
        <h1 className="font-serif text-2xl">Discover</h1>
        <span className="text-xs text-muted-foreground">{posts?.length ?? 0} geotagged frames</span>
      </div>

      <div className="absolute inset-0 pt-14">
        {Map ? <Map.DiscoverMap posts={posts ?? []} onSelect={setSelected} /> : <div className="h-full w-full animate-pulse bg-muted" />}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          {selected && (
            <div>
              <PostMedia
                path={selected.media[0]?.storage_path ?? ""}
                type={selected.media[0]?.media_type ?? "image"}
                width={selected.media[0]?.width}
                height={selected.media[0]?.height}
              />
              <div className="p-4">
                <Link to="/u/$username" params={{ username: selected.author.username }} className="flex items-center gap-3">
                  <AvatarImage path={selected.author.avatar_url} name={selected.author.display_name ?? selected.author.username} />
                  <div>
                    <div className="text-sm font-medium">{selected.author.display_name || selected.author.username}</div>
                    <div className="text-xs text-muted-foreground">@{selected.author.username} · {selected.location_name ?? "Unnamed location"}</div>
                  </div>
                </Link>
                {selected.caption && <p className="mt-3 text-sm">{selected.caption}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
