import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AvatarImage } from "@/components/avatar-image";
import { PostMedia } from "@/components/post-media";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, MessageCircle, Plus, Play, Image as ImageIcon, LayoutGrid, CalendarDays, AtSign } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { FollowersDialog } from "@/components/followers-dialog";

export const Route = createFileRoute("/u/$username")({
  ssr: false,
  component: ProfilePage,
});

const tierLabels: Record<string, string> = {
  close_friend: "Close Friend",
  acquaintance: "Acquaintance",
  public: "Following",
};

type Tab = "all" | "photos" | "reels";

function ProfilePage() {
  const { username } = Route.useParams();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [followDlg, setFollowDlg] = useState<null | "followers" | "following">(null);
  const [tab, setTab] = useState<Tab>("all");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["profile-posts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("posts")
        .select("id, created_at, is_reel, media:post_media (storage_path, media_type, width, height, position)")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["profile-counts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [followers, following, likes] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile!.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile!.id),
        supabase.from("likes").select("post_id, posts!inner(user_id)", { count: "exact", head: true }).eq("posts.user_id", profile!.id),
      ]);
      return { followers: followers.count ?? 0, following: following.count ?? 0, likes: likes.count ?? 0 };
    },
  });

  const { data: myFollow } = useQuery({
    queryKey: ["my-follow", user?.id, profile?.id],
    enabled: !!user?.id && !!profile?.id && user!.id !== profile!.id,
    queryFn: async () => {
      const { data } = await supabase.from("follows").select("tier").eq("follower_id", user!.id).eq("following_id", profile!.id).maybeSingle();
      return data;
    },
  });

  const followMutation = useMutation({
    mutationFn: async (tier: "close_friend" | "acquaintance" | "public" | null) => {
      if (!user || !profile) return;
      if (tier === null) {
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
      } else if (myFollow) {
        await supabase.from("follows").update({ tier }).eq("follower_id", user.id).eq("following_id", profile.id);
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id, tier });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-follow"] });
      qc.invalidateQueries({ queryKey: ["profile-counts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!profile) return <div className="p-8 font-serif text-2xl">Not found.</div>;

  const isMe = user?.id === profile.id;
  const showMetrics = profile.show_metrics_publicly || isMe;

  const visible = (posts ?? []).filter((p) => {
    if (tab === "all") return true;
    const first = [...(p.media ?? [])].sort((a, b) => a.position - b.position)[0];
    if (!first) return false;
    return tab === "reels" ? first.media_type === "video" : first.media_type === "image";
  });

  return (
    <div className="pb-16">
      {/* Cover */}
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary/30 via-muted to-background sm:h-56 md:h-64">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_60%)]" />
      </div>

      <div className="mx-auto max-w-4xl px-4">
        {/* Avatar + identity */}
        <div className="-mt-14 flex flex-col items-center text-center sm:-mt-16">
          <div className="rounded-full border-4 border-background shadow-xl">
            <AvatarImage path={profile.avatar_url} name={profile.display_name ?? profile.username} size={112} />
          </div>
          <h1 className="mt-3 font-serif text-3xl">{profile.display_name || profile.username}</h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
          {profile.bio && <p className="mt-3 max-w-lg text-sm text-muted-foreground">{profile.bio}</p>}

          {showMetrics ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              <span><span className="font-semibold tabular-nums">{posts?.length ?? 0}</span> <span className="text-muted-foreground">posts</span></span>
              <button onClick={() => setFollowDlg("followers")} className="hover:underline">
                <span className="font-semibold tabular-nums">{counts?.followers ?? 0}</span> <span className="text-muted-foreground">followers</span>
              </button>
              <button onClick={() => setFollowDlg("following")} className="hover:underline">
                <span className="font-semibold tabular-nums">{counts?.following ?? 0}</span> <span className="text-muted-foreground">following</span>
              </button>
              <span><span className="font-semibold tabular-nums">{counts?.likes ?? 0}</span> <span className="text-muted-foreground">likes</span></span>
            </div>
          ) : (
            !isMe && <p className="mt-4 text-xs italic text-muted-foreground">Metrics are private</p>
          )}

          {/* Actions */}
          <div className="mt-5 flex w-full max-w-md flex-wrap items-center justify-center gap-2">
            {isMe ? (
              <>
                <Link to="/settings" className="flex-1 min-w-[9rem]">
                  <Button className="w-full"><LayoutGrid className="mr-2 h-4 w-4" /> Dashboard</Button>
                </Link>
                <Link to="/create" className="flex-1 min-w-[9rem]">
                  <Button variant="outline" className="w-full"><Plus className="mr-2 h-4 w-4" /> Create</Button>
                </Link>
              </>
            ) : user ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant={myFollow ? "outline" : "default"} className="flex-1 min-w-[9rem]">
                      {myFollow ? tierLabels[myFollow.tier] : "Follow"} <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => followMutation.mutate("close_friend")}>Close Friend</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => followMutation.mutate("acquaintance")}>Acquaintance</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => followMutation.mutate("public")}>Following</DropdownMenuItem>
                    {myFollow && <DropdownMenuItem onClick={() => followMutation.mutate(null)}>Unfollow</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  className="flex-1 min-w-[9rem]"
                  onClick={() => nav({ to: "/messages/$userId", params: { userId: profile.id } })}
                >
                  <MessageCircle className="mr-2 h-4 w-4" /> Message
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Detail cards */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Details</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2"><AtSign className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="truncate">{profile.username}</span></li>
              <li className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Activity</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div><p className="font-semibold tabular-nums">{posts?.length ?? 0}</p><p className="text-xs text-muted-foreground">posts</p></div>
              <div><p className="font-semibold tabular-nums">{showMetrics ? counts?.followers ?? 0 : "—"}</p><p className="text-xs text-muted-foreground">followers</p></div>
              <div><p className="font-semibold tabular-nums">{showMetrics ? counts?.likes ?? 0 : "—"}</p><p className="text-xs text-muted-foreground">likes</p></div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-8 flex items-center gap-1 border-b border-border">
          {([
            ["all", "All", LayoutGrid],
            ["photos", "Photos", ImageIcon],
            ["reels", "Reels", Play],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors ${
                tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <section className="mt-1 grid grid-cols-3 gap-1">
          {visible.map((p) => {
            const first = [...(p.media ?? [])].sort((a, b) => a.position - b.position)[0];
            if (!first) return null;
            return (
              <Link key={p.id} to="/p/$postId" params={{ postId: p.id }} className="relative aspect-square overflow-hidden bg-muted">
                <PostMedia path={first.storage_path} type={first.media_type} width={first.width} height={first.height} className="!aspect-square" />
                {first.media_type === "video" && <Play className="absolute right-2 top-2 h-4 w-4 fill-white text-white drop-shadow" />}
              </Link>
            );
          })}
          {visible.length === 0 && <div className="col-span-full p-16 text-center text-sm text-muted-foreground">No frames yet.</div>}
        </section>
      </div>

      {followDlg && profile && (
        <FollowersDialog userId={profile.id} mode={followDlg} onClose={() => setFollowDlg(null)} />
      )}
    </div>
  );
}
