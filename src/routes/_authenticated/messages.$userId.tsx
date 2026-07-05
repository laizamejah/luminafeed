import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AvatarImage } from "@/components/avatar-image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/messages/$userId")({
  component: Thread,
});

function Thread() {
  const { userId } = Route.useParams();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const { data: partner } = useQuery({
    queryKey: ["profile-by-id", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["thread", user?.id, userId],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages")
        .select("*")
        .or(`and(sender_id.eq.${user!.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user!.id})`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const send = useMutation({
    mutationFn: async () => {
      if (!user || !text.trim()) return;
      const { error } = await supabase.from("messages").insert({ sender_id: user.id, recipient_id: userId, content: text.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["thread"] }); qc.invalidateQueries({ queryKey: ["threads"] }); },
  });

  if (!partner) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <AvatarImage path={partner.avatar_url} name={partner.display_name ?? partner.username} />
        <div>
          <div className="text-sm font-medium">{partner.display_name || partner.username}</div>
          <div className="text-xs text-muted-foreground">@{partner.username}</div>
        </div>
      </header>
      <div ref={scroller} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages?.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                {m.content}
              </div>
            </div>
          );
        })}
        {messages?.length === 0 && <p className="text-center text-xs text-muted-foreground mt-8">No messages yet. Say hi.</p>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="flex gap-2 border-t border-border p-4">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" maxLength={4000} />
        <Button type="submit" disabled={!text.trim() || send.isPending}>Send</Button>
      </form>
    </div>
  );
}
