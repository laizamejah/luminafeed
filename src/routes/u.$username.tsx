import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AvatarImage } from "@/components/avatar-image";
import { PostMedia } from "@/components/post-media";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
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

function ProfilePage() {
  const { username } = Route.useParams();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [followDlg, setFollowDlg] = useState<null | "followers" | "following">(null);

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
        .select("id, created_at, media:post_media (storage_path, media_type, width, height, position)")
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="flex flex-col md:flex-row md:items-center gap-6">
        <AvatarImage path={profile.avatar_url} name={profile.display_name ?? profile.username} size={96} />
        <div className="flex-1">
          <h1 className="font-serif text-3xl">{profile.display_name || profile.username}</h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
          {profile.bio && <p className="mt-3 text-sm max-w-lg">{profile.bio}</p>}
          {showMetrics && (
            <div className="mt-4 flex gap-6 text-sm">
              <div><span className="font-medium tabular-nums">{posts?.length ?? 0}</span> <span className="text-muted-foreground">posts</span></div>
              <button onClick={() => setFollowDlg("followers")} className="hover:underline"><span className="font-medium tabular-nums">{counts?.followers ?? 0}</span> <span className="text-muted-foreground">followers</span></button>
              <button onClick={() => setFollowDlg("following")} className="hover:underline"><span className="font-medium tabular-nums">{counts?.following ?? 0}</span> <span className="text-muted-foreground">following</span></button>
            </div>
          )}
          {!showMetrics && !isMe && <p className="mt-4 text-xs text-muted-foreground italic">Metrics are private</p>}
        </div>
        <div className="flex gap-2">
          {isMe ? (
            <Link to="/settings"><Button variant="outline">Edit profile</Button></Link>
          ) : user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={myFollow ? "outline" : "default"}>
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
              <Button variant="outline" onClick={() => nav({ to: "/messages/$userId", params: { userId: profile.id } })}>Message</Button>
            </>
          ) : null}
        </div>
      </header>

      <section className="mt-12 grid grid-cols-2 md:grid-cols-3 gap-1">
        {posts?.map((p) => {
          const first = [...(p.media ?? [])].sort((a, b) => a.position - b.position)[0];
          if (!first) return null;
          return (
            <Link key={p.id} to="/p/$postId" params={{ postId: p.id }} className="aspect-square overflow-hidden bg-muted">
              <PostMedia path={first.storage_path} type={first.media_type} width={first.width} height={first.height} className="!aspect-square" />
            </Link>
          );
        })}
        {posts?.length === 0 && <div className="col-span-full p-16 text-center text-sm text-muted-foreground">No frames yet.</div>}
      </section>

      {followDlg && profile && (
        <FollowersDialog userId={profile.id} mode={followDlg} onClose={() => setFollowDlg(null)} />
      )}
    </div>
  );
}

