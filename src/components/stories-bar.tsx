import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile, useCurrentUser } from "@/hooks/use-current-user";
import { AvatarImage } from "./avatar-image";
import { Plus } from "lucide-react";
import { StoryViewer, type StoryGroup } from "./story-viewer";
import { CreateStoryDialog } from "./create-story-dialog";

interface StoryAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface StoryRow {
  id: string;
  user_id: string;
  storage_path: string;
  media_type: "image" | "video";
  caption: string | null;
  background_color: string | null;
  text_content: string | null;
  created_at: string;
  expires_at: string;
  audio_preview_url?: string | null;
  audio_title?: string | null;
  audio_artist?: string | null;
  audio_artwork_url?: string | null;
  author: StoryAuthor | null;
}

export function StoriesBar() {
  const { data: me } = useCurrentProfile();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());

  const { data: stories = [], refetch } = useQuery({
    queryKey: ["stories"],
    queryFn: async () => {
      try {
        const { data: storyRows, error: storyError } = await supabase
          .from("stories")
          .select("id, user_id, storage_path, media_type, caption, background_color, text_content, created_at, expires_at, audio_preview_url, audio_title, audio_artist, audio_artwork_url")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(200);

        if (storyError) throw storyError;

        const storiesData = (storyRows ?? []) as unknown as Array<Omit<StoryRow, "author">>;
        const userIds = [...new Set(storiesData.map((story) => story.user_id))];
        const authorMap = new Map<string, StoryAuthor>();

        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", userIds);

          if (profilesError) throw profilesError;

          for (const profile of (profiles ?? []) as StoryAuthor[]) {
            authorMap.set(profile.id, profile);
          }
        }

        return storiesData.map((story) => ({
          ...story,
          author: authorMap.get(story.user_id) ?? null,
        })) as StoryRow[];
      } catch (err) {
        console.error("Failed to load stories", err);
        return [] as StoryRow[];
      }
    },
    refetchInterval: 60_000,
  });

  const { data: viewedRows = [] } = useQuery({
    queryKey: ["story-views", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", user!.id);
      if (error) throw error;
      return (data ?? []) as { story_id: string }[];
    },
  });

  useEffect(() => {
    setViewedIds(new Set(viewedRows.map((row) => row.story_id)));
  }, [viewedRows]);

  const markViewed = (storyId: string) => {
    setViewedIds((current) => {
      const next = new Set(current);
      next.add(storyId);
      return next;
    });
  };

  // Group by user
  const groups: StoryGroup[] = [];
  const map = new Map<string, StoryGroup>();
  for (const s of stories) {
    const author = s.author;
    let g = map.get(s.user_id);
    if (!g) {
      const username = author?.username ?? s.user_id;
      g = {
        user_id: s.user_id,
        username,
        display_name: author?.display_name ?? username,
        avatar_url: author?.avatar_url ?? null,
        items: [],
      };
      map.set(s.user_id, g);
      groups.push(g);
    }
    g.items.push({ id: s.id, storage_path: s.storage_path, media_type: s.media_type, caption: s.caption, created_at: s.created_at });
  }
  // Sort items chronological within group
  groups.forEach((g) => g.items.sort((a, b) => a.created_at.localeCompare(b.created_at)));
  // Put my group first if exists
  if (me) {
    const mine = groups.findIndex((g) => g.user_id === me.id);
    if (mine > 0) {
      const [g] = groups.splice(mine, 1);
      groups.unshift(g);
    }
  }

  return (
    <>
      <div className="scrollbar-none flex flex-row gap-3 overflow-x-auto overscroll-x-contain border-b border-border p-4 touch-pan-x">
        {me && (
          <button onClick={() => setCreating(true)} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
            <div className="relative">
              <div className="rounded-full border border-border bg-card p-1">
                <AvatarImage path={me.avatar_url} name={me.display_name ?? me.username} size={62} />
              </div>
              <span className="absolute -bottom-1 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border-2 border-background bg-[color:var(--story-blue)] text-[color:var(--story-blue-foreground)] shadow-sm">
                <Plus className="h-4 w-4" />
              </span>
            </div>
            <span className="mt-1 w-full truncate text-center text-[11px] font-medium">Create story</span>
          </button>
        )}
        {groups.map((g, i) => {
          const viewed = g.items.length > 0 && g.items.every((item) => viewedIds.has(item.id));
          return (
            <button key={g.user_id} onClick={() => setViewIndex(i)} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
              <div className={viewed ? "rounded-full bg-border p-[2px]" : "rounded-full bg-[linear-gradient(135deg,var(--story-blue),var(--ochre))] p-[2px]"}>
                <div className="rounded-full bg-background p-[3px]">
                  <AvatarImage path={g.avatar_url} name={g.display_name ?? g.username} size={62} />
                </div>
              </div>
              <span className="w-full truncate text-center text-[11px]">{g.display_name || g.username}</span>
            </button>
          );
        })}
      </div>

      {viewIndex !== null && (
        <StoryViewer groups={groups} startIndex={viewIndex} onClose={() => setViewIndex(null)} onViewed={markViewed} />
      )}
      {creating && (
        <CreateStoryDialog
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await queryClient.invalidateQueries({ queryKey: ["stories"] });
            await refetch();
          }}
        />
      )}
    </>
  );
}
