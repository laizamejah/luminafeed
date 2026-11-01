import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { X, ChevronLeft, ChevronRight, Heart, Play, Pause, Music, Volume2, VolumeX, Send, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AvatarImage } from "./avatar-image";

const REACTIONS = ["❤️", "🔥", "😂", "😮", "😢", "👏"];

export interface StoryItem {
  id: string;
  storage_path: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  audio_preview_url?: string | null;
  audio_title?: string | null;
  audio_artist?: string | null;
  audio_artwork_url?: string | null;
}

export interface StoryGroup {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  items: StoryItem[];
}

const DURATION_MS = 5000;

let sharedAudio: HTMLAudioElement | null = null;
export function getStoryAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.loop = true;
    sharedAudio.preload = "auto";
    sharedAudio.setAttribute("playsinline", "");
  }
  return sharedAudio;
}
/** Call inside the tap that opens a story so iOS allows audio playback. */
export function primeStoryAudio(url?: string | null) {
  const a = getStoryAudio();
  if (url) a.src = url;
  a.muted = false;
  a.play().then(() => { if (!url) a.pause(); }).catch(() => {});
}

export function StoryViewer({ groups, startIndex, onClose, onViewed }: { groups: StoryGroup[]; startIndex: number; onClose: () => void; onViewed?: (storyId: string) => void }) {
  const [gIdx, setGIdx] = useState(startIndex);
  const [iIdx, setIIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(typeof window !== "undefined" ? getStoryAudio() : null);
  const { data: user } = useCurrentUser();

  const group = groups[gIdx];
  const item = group?.items[iIdx];
  const { data: url } = useSignedUrl("media", item?.storage_path);

  useEffect(() => {
    if (!item || !user) return;
    supabase.from("story_views").upsert({ story_id: item.id, viewer_id: user.id }).then(({ error }) => {
      if (!error) onViewed?.(item.id);
    });
  }, [item, onViewed, user]);

  useEffect(() => {
    if (!item || item.media_type === "video") return;
    setProgress(0);
    const start = Date.now();
    const t = setInterval(() => {
      const p = (Date.now() - start) / DURATION_MS;
      if (p >= 1) { next(); }
      else setProgress(p);
    }, 50);
    return () => clearInterval(t);
  }, [item?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Reset state
    setPlaying(false);
    audio.muted = muted;
    if (!item?.audio_preview_url) { audio.pause(); return; }
    if (audio.src !== item.audio_preview_url) { audio.src = item.audio_preview_url; }
    audio.currentTime = 0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setPlaying(true);
        })
        .catch((error) => {
          console.error("Autoplay prevented:", error);
          setPlaying(false);
          // Don't toast here to avoid annoying the user if they're just scrolling through
        });
    }
  }, [item?.audio_preview_url, item?.id]);

  useEffect(() => () => { getStoryAudio().pause(); }, []);

  function next() {
    if (!group) return;
    if (iIdx + 1 < group.items.length) setIIdx(iIdx + 1);
    else if (gIdx + 1 < groups.length) { setGIdx(gIdx + 1); setIIdx(0); }
    else onClose();
  }
  function prev() {
    if (iIdx > 0) setIIdx(iIdx - 1);
    else if (gIdx > 0) { setGIdx(gIdx - 1); setIIdx(0); }
  }

  function toggleSpeaker() {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !muted;
    setMuted(nextMuted);
    audio.muted = nextMuted;
    if (!nextMuted && !playing && item?.audio_preview_url) {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  async function sendReply() {
    if (!user || !group || !item) return;
    const text = replyText.trim();
    if (!text || sendingReply) return;
    setSendingReply(true);
    try {
      // Find an existing conversation between me and the author (either direction)
      const { data: convo } = await supabase
        .from("conversations")
        .select("id, owner_id, partner_id")
        .or(`and(owner_id.eq.${user.id},partner_id.eq.${group.user_id}),and(owner_id.eq.${group.user_id},partner_id.eq.${user.id})`)
        .maybeSingle();
      let convoId = convo?.id;
      if (!convoId) {
        const { data: created, error: createErr } = await supabase
          .from("conversations")
          .insert({ owner_id: user.id, partner_id: group.user_id })
          .select("id")
          .single();
        if (createErr) throw createErr;
        convoId = created.id;
      }
      const { error: msgErr } = await supabase.from("messages").insert({
        sender_id: user.id,
        recipient_id: group.user_id,
        content: `Replied to ${group.display_name ?? group.username}'s story: ${text}`,
      });
      if (msgErr) throw msgErr;
      try {
        if (group.user_id !== user.id) {
          await supabase.from("notifications").insert({
            user_id: group.user_id,
            actor_id: user.id,
            type: "story_reply",
            data: { story_id: item.id, text },
          });
        }
      } catch {}
      toast.success("Reply sent");
      setReplyText("");
      setReplyOpen(false);
    } catch {
      toast.error("Could not send reply");
    } finally {
      setSendingReply(false);
    }
  }

  if (!group || !item) return null;

  const showMusic = !!item.audio_preview_url;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div className="relative w-full max-w-md h-full md:h-[90vh] md:max-h-[900px] bg-black overflow-hidden md:rounded-lg">
        {/* progress bars */}
        <div className="absolute inset-x-2 top-2 z-20 flex gap-1">
          {group.items.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 overflow-hidden rounded">
              <div className="h-full bg-white transition-[width]" style={{ width: `${i < iIdx ? 100 : i === iIdx ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>

        <div className="absolute top-5 inset-x-2 z-20 flex items-center gap-2 px-2 pt-2">
          <AvatarImage path={group.avatar_url} name={group.display_name ?? group.username} size={32} />
          <div className="text-white text-sm flex-1">
            <div className="font-medium">{group.display_name || group.username}</div>
            <div className="text-[10px] text-white/70">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</div>
          </div>
          {showMusic && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleSpeaker(); }}
              className="text-white/80 hover:text-white p-2"
              aria-label={muted ? "Unmute music" : "Mute music"}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          )}
          <button onClick={onClose} className="text-white/80 hover:text-white p-2"><X className="h-5 w-5" /></button>
        </div>

        {/* media */}
        <div className="absolute inset-0 flex items-center justify-center">
          {url && item.media_type === "image" && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
          {url && item.media_type === "video" && (
            <video
              key={item.id}
              src={url}
              autoPlay
              muted
              playsInline
              preload="auto"
              controls={false}
              onEnded={next}
              onCanPlay={(e) => { e.currentTarget.play().catch(() => {}); }}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>

        {item.caption && (
          <div className="absolute bottom-40 inset-x-4 z-20 text-center text-white text-sm bg-black/40 backdrop-blur px-3 py-2 rounded">
            {item.caption}
          </div>
        )}

        {showMusic && (
          <div className="absolute bottom-24 left-4 right-4 z-20 rounded-3xl border border-white/20 bg-black/70 p-3 text-white backdrop-blur sm:left-auto sm:right-auto sm:w-[calc(100%-4rem)]">
            <div className="flex items-center gap-3">
              {item.audio_artwork_url ? (
                <img src={item.audio_artwork_url} alt={item.audio_title ?? "Audio artwork"} className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-white/10 text-white"><Music className="h-5 w-5" /></div>
              )}
              <div className="flex-1 min-w-0 text-xs">
                <div className="truncate font-medium">{item.audio_title ?? "Audio clip"}</div>
                <div className="truncate text-white/70">{item.audio_artist ?? "Apple Music preview"}</div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const audio = audioRef.current;
                  if (!audio) return;
                  if (playing) { audio.pause(); setPlaying(false); }
                  else { audio.play().then(() => setPlaying(true)).catch(() => {}); }
                }}
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label={playing ? "Pause audio" : "Play audio"}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleSpeaker(); }}
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label={muted ? "Unmute audio" : "Mute audio"}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        {/* reply + reactions bar */}
        {user && (
          <div className="absolute bottom-4 inset-x-0 z-20 space-y-2">
            {replyOpen && (
              <form
                onSubmit={(e) => { e.preventDefault(); sendReply(); }}
                className="mx-auto flex w-[calc(100%-2rem)] max-w-sm items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 backdrop-blur"
              >
                <input
                  autoFocus
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${group.display_name || group.username}…`}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none"
                  maxLength={500}
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white disabled:opacity-40"
                  aria-label="Send reply"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            )}
            <div className="flex justify-center">
              <div className="flex items-center gap-1 rounded-full bg-black/50 backdrop-blur px-2 py-1.5 border border-white/10">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setReplyOpen((v) => !v); }}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${replyOpen ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10"}`}
                  aria-label="Reply to story"
                >
                  <MessageCircle className="h-4 w-4" /> Reply
                </button>
                <div className="h-5 w-px bg-white/20" />
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { data, error } = await supabase
                        .from("story_reactions")
                        .insert({ story_id: item.id, user_id: user.id, emoji })
                        .select("id")
                        .maybeSingle();
                      if (error) {
                        if (String(error.message).includes("duplicate")) {
                          toast.success(`Reacted ${emoji}`);
                        } else {
                          toast.error("Could not react");
                        }
                      } else {
                        toast.success(`Reacted ${emoji}`);
                        try {
                          if (group.user_id !== user.id) {
                            await supabase.from("notifications").insert({ user_id: group.user_id, actor_id: user.id, type: "story_reaction", data: { story_id: item.id, reaction_id: data?.id, emoji } });
                          }
                        } catch {}
                      }
                    }}
                    className="text-2xl px-2 py-1 hover:scale-125 transition-transform"
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                <div className="pl-2 pr-1 text-white/60"><Heart className="h-4 w-4" /></div>
              </div>
            </div>
          </div>
        )}

        {/* tap zones */}
        <button onClick={prev} className="absolute left-0 top-16 bottom-24 w-1/3 z-10" aria-label="Previous"><span className="sr-only">Prev</span></button>
        <button onClick={next} className="absolute right-0 top-16 bottom-24 w-1/3 z-10" aria-label="Next"><span className="sr-only">Next</span></button>

        <button onClick={prev} className="hidden md:flex absolute -left-12 top-1/2 -translate-y-1/2 text-white/70"><ChevronLeft className="h-8 w-8" /></button>
        <button onClick={next} className="hidden md:flex absolute -right-12 top-1/2 -translate-y-1/2 text-white/70"><ChevronRight className="h-8 w-8" /></button>
      </div>
    </div>
  );
}
