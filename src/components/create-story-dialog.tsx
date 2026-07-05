import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { MusicPicker } from "./music-picker";
import type { SpotifyTrack } from "@/lib/spotify.functions";

export function CreateStoryDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [showMusic, setShowMusic] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!user || !file) return;
    setUploading(true);
    try {
      const isVideo = file.type.startsWith("video/");
      const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const path = `${user.id}/stories/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const storyPayload = {
        user_id: user.id,
        storage_path: path,
        media_type: isVideo ? "video" : "image",
        caption: caption || null,
        ...(track
          ? {
              audio_preview_url: track.preview_url,
              audio_title: track.title,
              audio_artist: track.artist,
              audio_artwork_url: track.artwork_url,
            }
          : {}),
      };

      const { error: insertErr } = await supabase.from("stories").insert(storyPayload);
      if (insertErr) throw insertErr;
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Share to your story</DialogTitle>
              <p className="text-sm text-muted-foreground">Your story will be visible for 24 hours.</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-background p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full border border-border bg-muted" />
              <div>
                <p className="text-sm font-medium">Your story</p>
                <p className="text-xs text-muted-foreground">Add a photo or video to share a moment.</p>
              </div>
            </div>

            {!file ? (
              <label className="mt-4 flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-muted/70 p-6 text-center text-sm text-muted-foreground cursor-pointer hover:border-primary hover:text-foreground">
                <span className="text-base font-medium text-foreground">Tap to add a photo or video</span>
                <span>Story content disappears after 24 hours.</span>
                <input type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="relative overflow-hidden rounded-3xl border border-border bg-black/5">
                  {file.type.startsWith("video/") ? (
                    <video src={URL.createObjectURL(file)} className="h-64 w-full object-cover" controls />
                  ) : (
                    <img src={URL.createObjectURL(file)} alt="Story preview" className="h-64 w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="absolute right-3 top-3 rounded-full bg-background/90 p-2 text-sm text-muted-foreground hover:bg-background"
                  >
                    Change
                  </button>
                </div>
                <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption (optional)" maxLength={200} />
                <div className="rounded-3xl border border-border bg-background p-3">
                  <button
                    type="button"
                    onClick={() => setShowMusic((s) => !s)}
                    className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/50"
                  >
                    {showMusic ? "Remove music" : track ? `Music selected: ${track.title}` : "Add music to story"}
                  </button>
                  {showMusic && (
                    <div className="mt-3">
                      <MusicPicker value={track} onChange={setTrack} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Share a story with your friends and followers.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
              <Button onClick={upload} disabled={uploading || !file} className="min-w-[140px]">
                {uploading ? "Sharing…" : "Share story"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
