import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { AvatarImage } from "@/components/avatar-image";
import { PresenceAvatar } from "@/components/presence-avatar";
import { usePresence, isActive, lastActiveLabel } from "@/hooks/use-presence";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronLeft, Phone, Video, Camera, Image as ImageIcon, Mic, Smile, ThumbsUp, Lock, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages/$userId")({
  component: Thread,
});

const IMG_PREFIX = "[img]";
const STORY_PREFIX = "[story-reply]";
const QUICK_REACTIONS = ["❤️", "😂", "👍", "🔥", "😭"];
const EMOJIS = ["😀", "😂", "🥰", "😍", "😎", "🤔", "😢", "😭", "😡", "👍", "👏", "🙏", "🔥", "❤️", "💯", "🎉", "✨", "🌙", "📸", "☕"];

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yest = new Date(today.getTime() - 86400000);
  if (same(d, today)) return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (same(d, yest)) return `Yesterday ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function MessageImage({ path }: { path: string }) {
  const isUrl = path.startsWith("http");
  const { data: signed } = useSignedUrl("media", isUrl ? null : path);
  const url = isUrl ? path : signed;
  if (!url) return <div className="h-40 w-56 animate-pulse rounded-2xl bg-secondary" />;
  return <img src={url} alt="Shared photo" className="max-h-72 rounded-2xl object-cover" loading="lazy" />;
}

function Thread() {
  const { userId } = Route.useParams();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const { data: partner } = useQuery({
    queryKey: ["profile-by-id", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    },
  });

  const { data: presence = {} } = usePresence([userId]);
  const partnerActive = isActive(presence[userId]);

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

  // Mark incoming messages as read
  useEffect(() => {
    if (!user?.id || !messages?.some((m) => m.recipient_id === user.id && !m.read_at)) return;
    supabase.from("messages").update({ read_at: new Date().toISOString() })
      .eq("sender_id", userId).eq("recipient_id", user.id).is("read_at", null)
      .then(() => qc.invalidateQueries({ queryKey: ["threads"] }));
  }, [messages, user?.id, userId, qc]);

  const sendRaw = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !content.trim()) return;
      const { error } = await supabase.from("messages").insert({ sender_id: user.id, recipient_id: userId, content });
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["thread"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendPhoto = useMutation({
    mutationFn: async (file: File) => {
      const path = `${user!.id}/dm/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false });
      if (error) throw error;
      const { error: insErr } = await supabase.from("messages")
        .insert({ sender_id: user!.id, recipient_id: userId, content: `${IMG_PREFIX}${path}` });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thread"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!partner) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const name = partner.display_name || partner.username;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] md:h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-border px-3 py-2 liquid-glass">
        <button onClick={() => nav({ to: "/messages" })} className="md:hidden p-1 -ml-1" aria-label="Back">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <PresenceAvatar path={partner.avatar_url} name={name} size={40} active={partnerActive} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">
            {partnerActive ? "Active now" : lastActiveLabel(presence[userId]) ? `Active ${lastActiveLabel(presence[userId])} ago` : `@${partner.username}`}
          </div>
        </div>
        <button
          onClick={() => toast.info(`Calling ${name}…`)}
          className="grid h-9 w-9 place-items-center rounded-full liquid-glass" aria-label="Audio call"
        ><Phone className="h-4 w-4" /></button>
        <button
          onClick={() => toast.info(`Starting video call with ${name}…`)}
          className="grid h-9 w-9 place-items-center rounded-full liquid-glass" aria-label="Video call"
        ><Video className="h-4 w-4" /></button>
      </header>

      {/* Messages */}
      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-6">
        {/* Profile intro banner */}
        <div className="flex flex-col items-center gap-2 pb-6 text-center">
          <AvatarImage path={partner.avatar_url} name={name} size={96} />
          <div className="text-lg font-semibold">{name}</div>
          {partner.bio && <p className="max-w-xs text-sm text-muted-foreground">{partner.bio}</p>}
          <p className="text-xs text-muted-foreground">Lumina · @{partner.username}</p>
          <Button asChild variant="secondary" size="sm" className="mt-1 rounded-full">
            <Link to="/u/$username" params={{ username: partner.username }}>View profile</Link>
          </Button>
        </div>

        {/* Privacy notice */}
        <div className="mx-auto mb-6 flex max-w-sm items-start gap-2 rounded-2xl bg-secondary/50 p-3 text-center text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="text-left">Messages are private between you and {name}. Lumina never shows your chats to anyone else.</span>
        </div>

        <div className="space-y-2">
          {messages?.map((m, i) => {
            const mine = m.sender_id === user?.id;
            const prev = messages[i - 1];
            const showDate = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 30 * 60 * 1000;
            const isImage = m.content.startsWith(IMG_PREFIX);
            const isStoryReply = m.content.startsWith(STORY_PREFIX);
            const body = isStoryReply ? m.content.slice(STORY_PREFIX.length) : m.content;
            return (
              <div key={m.id}>
                {showDate && (
                  <p className="py-3 text-center text-[11px] font-medium text-muted-foreground">{dayLabel(m.created_at)}</p>
                )}
                {isStoryReply && (
                  <p className={cn("pb-1 text-[11px] text-muted-foreground", mine ? "text-right" : "text-left")}>
                    {mine ? `You replied to ${name}'s story` : `${name} replied to your story`}
                  </p>
                )}
                <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  {isImage ? (
                    <MessageImage path={m.content.slice(IMG_PREFIX.length)} />
                  ) : (
                    <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                      {body}
                    </div>
                  )}
                </div>
                {mine && i === messages.length - 1 && (
                  <p className="pt-1 text-right text-[10px] text-muted-foreground">{m.read_at ? "Seen" : "Delivered"}</p>
                )}
              </div>
            );
          })}
          {messages?.length === 0 && <p className="text-center text-xs text-muted-foreground mt-8">No messages yet. Say hi.</p>}
        </div>
      </div>

      {/* Quick reactions */}
      <div className="flex items-center justify-center gap-3 px-4 pb-1">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => sendRaw.mutate(e)}
            className="grid h-9 w-9 place-items-center rounded-full liquid-glass text-lg transition-transform active:scale-90"
            aria-label={`Send ${e}`}
          >{e}</button>
        ))}
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="mx-4 mb-2 grid grid-cols-10 gap-1 rounded-2xl bg-secondary/60 p-2">
          {EMOJIS.map((e) => (
            <button key={e} className="text-lg" onClick={() => setText((t) => t + e)}>{e}</button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendRaw.mutate(text.trim()); }}
        className="flex items-center gap-1.5 border-t border-border px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendPhoto.mutate(f); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendPhoto.mutate(f); e.target.value = ""; }} />
        <button type="button" onClick={() => cameraRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary" aria-label="Camera">
          <Camera className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary" aria-label="Photos">
          <ImageIcon className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => toast.info("Hold to record — voice notes coming to Lumina soon")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary" aria-label="Voice note">
          <Mic className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center gap-1 rounded-full bg-secondary/70 px-3 py-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Aa"
            maxLength={4000}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="button" onClick={() => setShowEmoji((v) => !v)} className="text-primary" aria-label="Emoji">
            <Smile className="h-5 w-5" />
          </button>
        </div>
        {text.trim() ? (
          <button type="submit" disabled={sendRaw.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary" aria-label="Send">
            <Send className="h-5 w-5" />
          </button>
        ) : (
          <button type="button" onClick={() => sendRaw.mutate("👍")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary" aria-label="Send like">
            <ThumbsUp className="h-5 w-5" />
          </button>
        )}
      </form>
    </div>
  );
}
