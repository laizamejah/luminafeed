"use client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { X, MapPin } from "lucide-react";
import { MusicPicker } from "@/components/music-picker";
import type { SpotifyTrack } from "@/lib/spotify.functions";

export const Route = createFileRoute("/_authenticated/create")({
  component: CreatePage,
});

interface Draft {
  file: File;
  preview: string;
  thumbnailFile: File | null;
  thumbnailPreview: string | null;
  width: number;
  height: number;
  isVideo: boolean;
}

async function readImageMeta(file: File): Promise<{ width: number; height: number; isVideo: boolean }> {
  const isVideo = file.type.startsWith("video/");
  return new Promise((resolve, reject) => {
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, isVideo: true });
      v.onerror = () => reject(new Error("Cannot read video"));
      v.src = URL.createObjectURL(file);
    } else {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, isVideo: false });
      img.onerror = () => reject(new Error("Cannot read image"));
      img.src = URL.createObjectURL(file);
    }
  });
}

async function createVideoThumbnail(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (thumbnail: File | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(thumbnail);
    };

    const capture = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => finish(blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-thumbnail.jpg`, { type: "image/jpeg" }) : null),
          "image/jpeg",
          0.72,
        );
      } catch {
        finish(null);
      }
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (video.duration && Number.isFinite(video.duration) && video.duration > 0.25) {
        video.currentTime = 0.2;
      } else {
        capture();
      }
    };
    video.onseeked = capture;
    video.onerror = () => finish(null);
    video.src = objectUrl;
  });
}

function CreatePage() {
  const { data: user } = useCurrentUser();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [isReel, setIsReel] = useState(false);
  const [kidSafe, setKidSafe] = useState(false);
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();
  const musicRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("music") && musicRef.current) {
        setTimeout(() => musicRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 10 - drafts.length);
    const parsed = await Promise.all(arr.map(async (file) => {
      const meta = await readImageMeta(file);
      const thumbnailFile = meta.isVideo ? await createVideoThumbnail(file) : null;
      return {
        file,
        preview: URL.createObjectURL(file),
        thumbnailFile,
        thumbnailPreview: thumbnailFile ? URL.createObjectURL(thumbnailFile) : null,
        ...meta,
      };
    }));
    setDrafts([...drafts, ...parsed]);
  }

  function captureLocation() {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Location captured");
      },
      () => toast.error("Could not capture location"),
    );
  }

  async function submit() {
    if (!user || drafts.length === 0) return;
    setSubmitting(true);
    try {
      const { data: post, error: postErr } = await supabase.from("posts").insert({
        user_id: user.id,
        caption: caption || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        location_name: location || null,
        comments_enabled: commentsEnabled,
        is_reel: isReel || drafts.some((d) => d.isVideo),
        kid_safe: kidSafe,
        audio_preview_url: track?.preview_url ?? null,
        audio_title: track?.title ?? null,
        audio_artist: track?.artist ?? null,
        audio_artwork_url: track?.artwork_url ?? null,
      }).select().single();
      if (postErr) throw postErr;

      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        const ext = d.file.name.split(".").pop() || (d.isVideo ? "mp4" : "jpg");
        const path = `${user.id}/${post.id}/${i}-${crypto.randomUUID()}.${ext}`;
        let thumbnailPath: string | null = null;
        const { error: upErr } = await supabase.storage.from("media").upload(path, d.file, {
          contentType: d.file.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        if (d.thumbnailFile) {
          thumbnailPath = `${user.id}/${post.id}/thumbs/${i}-${crypto.randomUUID()}.jpg`;
          const { error: thumbErr } = await supabase.storage.from("media").upload(thumbnailPath, d.thumbnailFile, {
            contentType: d.thumbnailFile.type,
            upsert: false,
          });
          if (thumbErr) throw thumbErr;
        }
        const { error: mErr } = await supabase.from("post_media").insert({
          post_id: post.id,
          uploader_id: user.id,
          storage_path: path,
          media_type: d.isVideo ? "video" : "image",
          width: d.width,
          height: d.height,
          thumbnail_path: thumbnailPath,
          position: i,
        });
        if (mErr) throw mErr;
      }

      toast.success("Published");
      nav({ to: "/feed" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <h1 className="font-serif text-3xl">New post</h1>
      <p className="mt-1 text-sm text-muted-foreground">Uncompressed. Any aspect ratio. Up to 10 items.</p>

      {/* Uploader */}
      <div className="mt-8">
        {drafts.length === 0 ? (
          <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-16 cursor-pointer hover:bg-secondary/40">
            <span className="font-serif text-xl">Drop photos or video</span>
            <span className="mt-2 text-xs text-muted-foreground">JPEG, PNG, HEIC, TIFF, MP4</span>
            <input type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
          </label>
        ) : (
          <div>
            <div className="grid grid-cols-3 gap-2">
              {drafts.map((d, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  {d.isVideo ? (
                    <video src={d.preview} poster={d.thumbnailPreview ?? undefined} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <img src={d.preview} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1"
                  ><X className="h-3 w-3" /></button>
                </div>
              ))}
              {drafts.length < 10 && (
                <label className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border cursor-pointer text-xs text-muted-foreground hover:bg-secondary/40">
                  + Add
                  <input type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <Label htmlFor="cap">Caption</Label>
          <Textarea id="cap" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} placeholder="Say something (or don't)" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="loc">Location name</Label>
            <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kyoto, Japan" maxLength={120} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={captureLocation} type="button" className="w-full">
              <MapPin className="h-4 w-4" />
              {coords ? `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}` : "Capture coordinates"}
            </Button>
          </div>
        </div>

        <div ref={musicRef}>
          <Label>Attach music (Spotify 30-sec preview)</Label>
          <div className="mt-2"><MusicPicker value={track} onChange={setTrack} /></div>
        </div>


        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">Allow comments</div>
            <div className="text-xs text-muted-foreground">When off, viewers can DM you privately instead.</div>
          </div>
          <Switch checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">Mark as short-form / reel</div>
            <div className="text-xs text-muted-foreground">Viewers can hide reels from their feed.</div>
          </div>
          <Switch checked={isReel} onCheckedChange={setIsReel} />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">Safe for kid accounts</div>
            <div className="text-xs text-muted-foreground">Only kid-safe posts appear in the feeds of accounts registered as minors.</div>
          </div>
          <Switch checked={kidSafe} onCheckedChange={setKidSafe} />
        </div>

        <Button onClick={submit} disabled={submitting || drafts.length === 0} className="w-full" size="lg">
          {submitting ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
