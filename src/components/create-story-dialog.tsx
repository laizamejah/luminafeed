import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useCurrentProfile } from "@/hooks/use-current-user";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { MusicPicker } from "./music-picker";
import type { SpotifyTrack } from "@/lib/spotify.functions";
import { AvatarImage } from "./avatar-image";
import {
  X,
  Search,
  ChevronDown,
  Check,
  Type,
  LayoutTemplate,
  Repeat,
  Images,
  Music,
  Video,
  Camera,
  ArrowLeft,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

type Mode = "gallery" | "text" | "templates" | "boomerang";
type Album = "camera" | "library" | "videos";

const ALBUM_LABELS: Record<Album, string> = {
  camera: "Camera roll",
  library: "Lumina library",
  videos: "Videos",
};

const TEXT_BACKGROUNDS = [
  { id: "ink", label: "Ink", css: "linear-gradient(135deg,#111827,#374151)" },
  { id: "sunset", label: "Sunset", css: "linear-gradient(135deg,#f97316,#db2777)" },
  { id: "ocean", label: "Ocean", css: "linear-gradient(135deg,#0ea5e9,#4338ca)" },
  { id: "forest", label: "Forest", css: "linear-gradient(135deg,#047857,#065f46)" },
  { id: "paper", label: "Paper", css: "linear-gradient(135deg,#fef3c7,#fcd34d)" },
];

const TEMPLATES = [
  { id: "quote", label: "Quote", bg: "linear-gradient(160deg,#0f172a,#1e293b)", font: "italic 72px Georgia, serif", color: "#f8fafc" },
  { id: "bold", label: "Bold", bg: "linear-gradient(160deg,#dc2626,#7c2d12)", font: "bold 96px Inter, sans-serif", color: "#ffffff" },
  { id: "soft", label: "Soft", bg: "linear-gradient(160deg,#fde68a,#fca5a5)", font: "500 80px Inter, sans-serif", color: "#1f2937" },
  { id: "mono", label: "Mono", bg: "linear-gradient(160deg,#111111,#3f3f46)", font: "600 72px ui-monospace, monospace", color: "#a3e635" },
];

/** Paint a text story onto a 1080x1920 canvas and return it as an uploadable file. */
async function renderTextStory(text: string, bgCss: string, font: string, color: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d")!;
  const stops = bgCss.match(/#[0-9a-f]{6}/gi) ?? ["#111827", "#374151"];
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(1, stops[stops.length - 1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = canvas.width - 180;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  const lineHeight = parseInt(font.match(/(\d+)px/)?.[1] ?? "72", 10) * 1.3;
  const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, startY + i * lineHeight));

  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.95));
  return new File([blob], "story.jpg", { type: "image/jpeg" });
}

function LibraryTile({
  path,
  type,
  selected,
  onSelect,
}: {
  path: string;
  type: "image" | "video";
  selected: boolean;
  onSelect: () => void;
}) {
  const { data: url } = useSignedUrl("media", path);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative aspect-square overflow-hidden rounded-md bg-muted"
      aria-pressed={selected}
    >
      {url && type === "image" && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
      {url && type === "video" && <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />}
      {type === "video" && <Video className="absolute left-2 top-2 h-4 w-4 text-white drop-shadow" />}
      <span
        className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 ${
          selected ? "border-transparent bg-[color:var(--story-blue)] text-[color:var(--story-blue-foreground)]" : "border-white/80 bg-black/20"
        }`}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

export function CreateStoryDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: user } = useCurrentUser();
  const { data: me } = useCurrentProfile();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("gallery");
  const [album, setAlbum] = useState<Album>("camera");
  const [multi, setMulti] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [libraryPaths, setLibraryPaths] = useState<{ path: string; type: "image" | "video" }[]>([]);
  const [caption, setCaption] = useState("");
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [showMusic, setShowMusic] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [text, setText] = useState("");
  const [bg, setBg] = useState(TEXT_BACKGROUNDS[0]);
  const [template, setTemplate] = useState(TEMPLATES[0]);

  const galleryInput = useRef<HTMLInputElement | null>(null);
  const boomerangInput = useRef<HTMLInputElement | null>(null);

  const { data: library = [] } = useQuery({
    queryKey: ["story-library", user?.id],
    enabled: !!user?.id && (album === "library" || album === "videos"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("post_media")
        .select("id, storage_path, media_type, created_at")
        .eq("uploader_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as { id: string; storage_path: string; media_type: "image" | "video" }[];
    },
  });

  const libraryItems = useMemo(() => {
    const rows = album === "videos" ? library.filter((r) => r.media_type === "video") : library;
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.storage_path.toLowerCase().includes(q)) : rows;
  }, [library, album, search]);

  const selectionCount = files.length + libraryPaths.length;

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    setFiles((prev) => (multi ? [...prev, ...arr] : arr.slice(0, 1)));
    if (!multi) setLibraryPaths([]);
  }

  function toggleLibrary(item: { path: string; type: "image" | "video" }) {
    setLibraryPaths((prev) => {
      const exists = prev.some((p) => p.path === item.path);
      if (exists) return prev.filter((p) => p.path !== item.path);
      return multi ? [...prev, item] : [item];
    });
    if (!multi) setFiles([]);
  }

  async function insertStory(storagePath: string, mediaType: "image" | "video", extra: Record<string, unknown> = {}) {
    const { error } = await supabase.from("stories").insert({
      user_id: user!.id,
      storage_path: storagePath,
      media_type: mediaType,
      caption: caption || null,
      ...(track
        ? {
            audio_preview_url: track.preview_url,
            audio_title: track.title,
            audio_artist: track.artist,
            audio_artwork_url: track.artwork_url,
          }
        : {}),
      ...extra,
    });
    if (error) throw error;
  }

  async function uploadFile(file: File) {
    const isVideo = file.type.startsWith("video/");
    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const path = `${user!.id}/stories/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
    if (error) throw error;
    return { path, mediaType: (isVideo ? "video" : "image") as "image" | "video" };
  }

  async function share() {
    if (!user) return;
    setUploading(true);
    try {
      if (mode === "text" || mode === "templates") {
        if (!text.trim()) throw new Error("Write something first");
        const file =
          mode === "text"
            ? await renderTextStory(text, bg.css, "600 84px Inter, sans-serif", "#ffffff")
            : await renderTextStory(text, template.bg, template.font, template.color);
        const { path } = await uploadFile(file);
        await insertStory(path, "image", { text_content: text, background_color: mode === "text" ? bg.id : template.id });
      } else {
        if (selectionCount === 0) throw new Error("Pick a photo or video");
        for (const f of files) {
          const { path, mediaType } = await uploadFile(f);
          await insertStory(path, mediaType);
        }
        for (const item of libraryPaths) {
          await insertStory(item.path, item.type);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["stories"] });
      toast.success("Story shared — visible for 24 hours");
      onCreated();
    } catch (e) {
      console.error("Story upload failed", e);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const canShare = mode === "text" || mode === "templates" ? text.trim().length > 0 : selectionCount > 0;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-background">
      {/* Header */}
      <header className="liquid-glass grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary/60">
          <X className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 items-center justify-center gap-2">
          {showSearch ? (
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search media"
              className="h-9 rounded-full"
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-w-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-secondary/60">
                <span className="truncate">{ALBUM_LABELS[album]}</span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {(Object.keys(ALBUM_LABELS) as Album[]).map((key) => (
                  <DropdownMenuItem key={key} onClick={() => { setAlbum(key); setMode("gallery"); }}>
                    {ALBUM_LABELS[key]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => { setShowSearch((s) => !s); setSearch(""); }}
            aria-label="Search media"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary/60"
          >
            {showSearch ? <ArrowLeft className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setMulti((m) => !m)}
            aria-pressed={multi}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              multi ? "bg-[color:var(--story-blue)] text-[color:var(--story-blue-foreground)]" : "border border-border hover:bg-secondary/60"
            }`}
          >
            Select multiple
          </button>
        </div>
      </header>

      {/* Quick-creation modes */}
      <div className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto border-b border-border px-3 py-3">
        {([
          ["gallery", "Gallery", Images],
          ["text", "Text", Type],
          ["templates", "Templates", LayoutTemplate],
          ["boomerang", "Boomerang", Repeat],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              mode === key ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-secondary/60"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {me && (
          <div className="mb-3 flex items-center gap-3">
            <AvatarImage path={me.avatar_url} name={me.display_name ?? me.username} size={36} />
            <p className="text-sm text-muted-foreground">Your story stays visible for 24 hours.</p>
          </div>
        )}

        {mode === "gallery" && album === "camera" && (
          <>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6">
              <button
                type="button"
                onClick={() => galleryInput.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/60 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                <Camera className="h-6 w-6" />
                Camera roll
              </button>
              {files.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="relative aspect-square overflow-hidden rounded-md bg-muted"
                >
                  {f.type.startsWith("video/") ? (
                    <video src={URL.createObjectURL(f)} muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[color:var(--story-blue)] text-[color:var(--story-blue-foreground)]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
            <input
              ref={galleryInput}
              type="file"
              accept="image/*,video/*"
              multiple={multi}
              className="sr-only"
              onChange={(e) => pickFiles(e.target.files)}
            />
            {files.length === 0 && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Tap “Camera roll” to browse photos and videos on this device.
              </p>
            )}
          </>
        )}

        {mode === "gallery" && album !== "camera" && (
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6">
            {libraryItems.map((item) => (
              <LibraryTile
                key={item.id}
                path={item.storage_path}
                type={item.media_type}
                selected={libraryPaths.some((p) => p.path === item.storage_path)}
                onSelect={() => toggleLibrary({ path: item.storage_path, type: item.media_type })}
              />
            ))}
            {libraryItems.length === 0 && (
              <p className="col-span-full p-10 text-center text-sm text-muted-foreground">Nothing in this album yet.</p>
            )}
          </div>
        )}

        {(mode === "text" || mode === "templates") && (
          <div className="mx-auto max-w-md space-y-4">
            <div
              className="grid aspect-[9/16] max-h-[46vh] w-full place-items-center rounded-2xl p-8 text-center"
              style={{ background: mode === "text" ? bg.css : template.bg, color: mode === "text" ? "#fff" : template.color }}
            >
              <p className="whitespace-pre-wrap break-words text-2xl font-semibold leading-snug">
                {text || "Start typing…"}
              </p>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={280}
              placeholder="What's on your mind?"
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="scrollbar-none flex gap-2 overflow-x-auto">
              {mode === "text"
                ? TEXT_BACKGROUNDS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBg(b)}
                      aria-label={b.label}
                      className={`h-10 w-10 shrink-0 rounded-full border-2 ${bg.id === b.id ? "border-foreground" : "border-transparent"}`}
                      style={{ background: b.css }}
                    />
                  ))
                : TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTemplate(t)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium ${
                        template.id === t.id ? "border-foreground" : "border-border text-muted-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
            </div>
          </div>
        )}

        {mode === "boomerang" && (
          <div className="mx-auto max-w-md space-y-4 text-center">
            <button
              type="button"
              onClick={() => boomerangInput.current?.click()}
              className="flex aspect-[9/16] max-h-[46vh] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/60 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              <Repeat className="h-8 w-8" />
              Record a short looping clip
            </button>
            <input
              ref={boomerangInput}
              type="file"
              accept="video/*"
              capture="user"
              className="sr-only"
              onChange={(e) => pickFiles(e.target.files)}
            />
            {files[0] && (
              <video src={URL.createObjectURL(files[0])} muted loop autoPlay playsInline className="mx-auto max-h-[40vh] rounded-2xl" />
            )}
            <p className="text-xs text-muted-foreground">Boomerang clips loop continuously when friends view your story.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="liquid-glass shrink-0 space-y-3 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {mode === "gallery" && (
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption (optional)" maxLength={200} />
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowMusic((s) => !s)}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60"
          >
            <Music className="h-4 w-4" />
            {track ? `Music: ${track.title}` : showMusic ? "Hide music" : "Add music"}
          </button>
          {showMusic && (
            <div className="mt-3 max-h-[30vh] overflow-y-auto">
              <MusicPicker value={track} onChange={setTrack} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {mode === "gallery" ? `${selectionCount} selected` : mode === "boomerang" ? "Boomerang" : "Text story"}
          </span>
          <Button onClick={share} disabled={uploading || !canShare} className="min-w-[140px]">
            {uploading ? "Sharing…" : "Share to story"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
