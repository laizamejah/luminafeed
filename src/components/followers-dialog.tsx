import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { AvatarImage } from "./avatar-image";

type Mode = "followers" | "following";

export function FollowersDialog({ userId, mode, onClose }: { userId: string; mode: Mode; onClose: () => void }) {
  const { data = [] } = useQuery({
    queryKey: ["follow-list", userId, mode],
    queryFn: async () => {
      const col = mode === "followers" ? "following_id" : "follower_id";
      const other = mode === "followers" ? "follower_id" : "following_id";
      const { data, error } = await supabase.from("follows").select(`${other}, tier`).eq(col, userId);
      if (error) throw error;
      const ids = (data ?? []).map((r) => (r as Record<string, unknown>)[other] as string);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      return profs ?? [];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="capitalize">{mode}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto -mx-2">
          {data.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No one yet.</p>
          ) : data.map((p) => (
            <Link key={p.id} to="/u/$username" params={{ username: p.username }} onClick={onClose} className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/60">
              <AvatarImage path={p.avatar_url} name={p.display_name ?? p.username} size={40} />
              <div className="min-w-0">
                <div className="text-sm truncate">{p.display_name || p.username}</div>
                <div className="text-xs text-muted-foreground truncate">@{p.username}</div>
              </div>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
