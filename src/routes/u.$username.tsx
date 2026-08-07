import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AvatarImage } from "@/components/avatar-image";
import { PostMedia } from "@/components/post-media";
import { PostCard } from "@/components/post-card";
import { CoverPhoto } from "@/components/cover-photo";
import { ProfileThoughtBubble } from "@/components/profile-thought-bubble";
import { ProfileDetailsDialog } from "@/components/profile-details-dialog";
import { VerifiedBadge } from "@/components/verified-badge";
import { CreateStoryDialog } from "@/components/create-story-dialog";
import { FollowersDialog } from "@/components/followers-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { fetchUserPosts } from "@/lib/feed";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ChevronDown, MessageCircle, Plus, Play, LayoutGrid, MapPin, Home, Heart, GraduationCap,
  Pencil, Camera, SlidersHorizontal, Settings2, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/u/$username")({
  ssr: false,
  component: ProfilePage,
});

const tierLabels: Record<string, string> = {
  close_friend: "Close Friend",
  acquaintance: "Acquaintance",
  public: "Following",
};

type Tab = "all" | "reels" | "photos" | "about";

function ProfilePage() {
  const { username } = Route.useParams();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const nav = useNavigate();
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const [followDlg, setFollowDlg] = useState<null | "followers" | "following">(null);
  const [tab, setTab] = useState<Tab>("all");
  const [editDetails, setEditDetails] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["profile-feed", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchUserPosts(profile!.id),
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

  const { data: friends = [] } = useQuery({
    queryKey: ["profile-friends", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase.from("follows").select("follower_id").eq("following_id", profile!.id).limit(9);
      const ids = (data ?? []).map((r) => r.follower_id as string);
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      return profs ?? [];
    },
  });

  const { data: highlights = [] } = useQuery({
    queryKey: ["profile-highlights", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("stories")
        .select("id, storage_path, media_type, caption, created_at")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
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

  async function uploadAvatar(file: File) {
    if (!profile) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) return toast.error(error.message);
    const { error: pErr } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", profile.id);
    if (pErr) return toast.error(pErr.message);
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Profile photo updated");
  }

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!profile) return <div className="p-8 font-serif text-2xl">Not found.</div>;

  const isMe = user?.id === profile.id;
  const showMetrics = profile.show_metrics_publicly || isMe;
  const feedPosts = posts ?? [];
  const visible = feedPosts.filter((p) => {
    if (tab === "reels") return p.is_reel || p.media.some((m) => m.media_type === "video");
    if (tab === "photos") return p.media.some((m) => m.media_type === "image");
    return true;
  });

  const details = [
    { icon: MapPin, label: "Lives in", value: profile.location },
    { icon: Home, label: "From", value: profile.hometown },
    { icon: Heart, label: "Relationship", value: profile.relationship_status },
    { icon: GraduationCap, label: "Education", value: profile.education },
  ];

  return (
    <div className="pb-24">
      <CoverPhoto userId={profile.id} coverPath={profile.cover_url} position={Number(profile.cover_position ?? 50)} editable={isMe} />

      <div className="mx-auto max-w-3xl px-4">
        {/* Avatar + thought bubble */}
        <div className="-mt-16 flex flex-col items-start">
          <div className="mb-2 ml-4">
            <ProfileThoughtBubble userId={profile.id} editable={isMe} />
          </div>
          <div className="relative">
            <div className="rounded-full border-4 border-background shadow-xl">
              <AvatarImage path={profile.avatar_url} name={profile.display_name ?? profile.username} size={128} />
            </div>
            {isMe && (
              <>
                <button
                  onClick={() => avatarInput.current?.click()}
                  aria-label="Change profile photo"
                  className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full border border-border bg-secondary shadow-md hover:bg-secondary/80"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                />
              </>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="mt-3">
          <h1 className="flex items-center font-serif text-3xl">
            {profile.display_name || profile.username}
            <VerifiedBadge verified={profile.verified} />
          </h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
          {profile.category && (
            <span className="mt-2 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium">{profile.category}</span>
          )}
          {profile.bio && <p className="mt-3 max-w-xl text-sm text-muted-foreground">{profile.bio}</p>}

          {showMetrics ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span><span className="font-semibold tabular-nums">{feedPosts.length}</span> <span className="text-muted-foreground">posts</span></span>
              <button onClick={() => setFollowDlg("followers")} className="hover:underline">
                <span className="font-semibold tabular-nums">{counts?.followers ?? 0}</span> <span className="text-muted-foreground">followers</span>
              </button>
              <button onClick={() => setFollowDlg("following")} className="hover:underline">
                <span className="font-semibold tabular-nums">{counts?.following ?? 0}</span> <span className="text-muted-foreground">following</span>
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs italic text-muted-foreground">Metrics are private</p>
          )}
        </div>

        {/* Primary actions */}
        <div className="mt-4 flex items-center gap-2">
          {isMe ? (
            <>
              <Link to="/settings" className="flex-1">
                <Button className="w-full"><LayoutGrid className="mr-2 h-4 w-4" /> Dashboard</Button>
              </Link>
              <Link to="/create" className="flex-1">
                <Button variant="secondary" className="w-full"><Plus className="mr-2 h-4 w-4" /> Create</Button>
              </Link>
            </>
          ) : user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={myFollow ? "secondary" : "default"} className="flex-1">
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
              <Button variant="secondary" className="flex-1" onClick={() => nav({ to: "/messages/$userId", params: { userId: profile.id } })}>
                <MessageCircle className="mr-2 h-4 w-4" /> Message
              </Button>
            </>
          ) : null}
        </div>

        {/* Sticky tabs */}
        <div className="sticky top-14 z-20 -mx-4 mt-5 px-4 py-2 liquid-glass">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {([["all", "All"], ["reels", "Reels"], ["photos", "Photos"], ["about", "More"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
                  tab === key ? "bg-foreground text-background" : "bg-secondary/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <section className="mt-5 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Details</h2>
            {isMe && (
              <button onClick={() => setEditDetails(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {details.map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className={value ? "" : "text-muted-foreground"}>
                  {value ? `${label}: ${value}` : `Add ${label.toLowerCase()}`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Friends */}
        <section className="mt-4 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Friends</h2>
            <button onClick={() => setFollowDlg("followers")} className="text-xs text-muted-foreground hover:text-foreground">See all</button>
          </div>
          {friends.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No friends to show yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {friends.map((f) => (
                <Link key={f.id} to="/u/$username" params={{ username: f.username }} className="text-center">
                  <div className="mx-auto w-fit"><AvatarImage path={f.avatar_url} name={f.display_name ?? f.username} size={64} /></div>
                  <p className="mt-1 truncate text-xs">{f.display_name || f.username}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Highlights */}
        <section className="mt-4">
          <h2 className="text-sm font-semibold">Story highlights</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto scrollbar-none pb-1">
            {isMe && (
              <button
                onClick={() => setStoryOpen(true)}
                className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-5 w-5" /> New
              </button>
            )}
            {highlights.map((h) => (
              <div key={h.id} className="h-28 w-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
                <PostMedia path={h.storage_path} type={h.media_type === "video" ? "video" : "image"} width={null} height={null} className="!aspect-[9/16] h-full" />
              </div>
            ))}
            {highlights.length === 0 && !isMe && (
              <p className="text-sm text-muted-foreground">No highlights yet.</p>
            )}
          </div>
        </section>

        {/* Feed */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">All posts</h2>
            <div className="flex items-center gap-2 text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              <Settings2 className="h-4 w-4" />
            </div>
          </div>

          {tab === "about" ? (
            <div className="mt-3 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 text-foreground"><Sparkles className="h-4 w-4" /> About {profile.display_name || profile.username}</p>
              <p className="mt-2">Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
              {profile.bio && <p className="mt-2">{profile.bio}</p>}
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {visible.map((p) => <PostCard key={p.id} post={p} />)}
              {visible.length === 0 && (
                <div className="rounded-2xl border border-border p-16 text-center text-sm text-muted-foreground">
                  <Play className="mx-auto mb-2 h-5 w-5" /> No frames yet.
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {followDlg && <FollowersDialog userId={profile.id} mode={followDlg} onClose={() => setFollowDlg(null)} />}
      {editDetails && (
        <ProfileDetailsDialog
          userId={profile.id}
          details={{
            location: profile.location,
            hometown: profile.hometown,
            relationship_status: profile.relationship_status,
            education: profile.education,
            category: profile.category,
            bio: profile.bio,
          }}
          onClose={() => setEditDetails(false)}
        />
      )}
      {storyOpen && (
        <CreateStoryDialog
          onClose={() => setStoryOpen(false)}
          onCreated={() => { setStoryOpen(false); qc.invalidateQueries({ queryKey: ["profile-highlights"] }); }}
        />
      )}
    </div>
  );
}
