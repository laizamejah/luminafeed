import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { Camera, Move } from "lucide-react";
import { toast } from "sonner";

/** Banner behind the profile avatar, with upload + vertical repositioning for the owner. */
export function CoverPhoto({
  userId,
  coverPath,
  position,
  editable,
}: {
  userId: string;
  coverPath: string | null;
  position: number;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const { data: url } = useSignedUrl("avatars", coverPath);
  const [repositioning, setRepositioning] = useState(false);
  const [pos, setPos] = useState(position);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/cover-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { error: pErr } = await supabase.from("profiles").update({ cover_url: path, cover_position: 50 }).eq("id", userId);
      if (pErr) throw pErr;
      setPos(50);
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Cover photo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function savePosition() {
    const { error } = await supabase.from("profiles").update({ cover_position: pos }).eq("id", userId);
    if (error) return toast.error(error.message);
    setRepositioning(false);
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Cover repositioned");
  }

  return (
    <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary/30 via-muted to-background sm:h-56 md:h-64">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" style={{ objectPosition: `50% ${pos}%` }} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_60%)]" />
      )}

      {editable && (
        <div className="absolute bottom-3 right-3 flex flex-wrap items-center justify-end gap-2">
          {repositioning ? (
            <div className="flex items-center gap-3 rounded-full bg-background/90 px-3 py-2 shadow-md backdrop-blur">
              <input
                type="range"
                min={0}
                max={100}
                value={pos}
                onChange={(e) => setPos(Number(e.target.value))}
                aria-label="Cover position"
                className="w-32 accent-[color:var(--ochre)]"
              />
              <button onClick={savePosition} className="text-xs font-medium hover:underline">Save</button>
              <button onClick={() => { setPos(position); setRepositioning(false); }} className="text-xs text-muted-foreground hover:underline">Cancel</button>
            </div>
          ) : (
            <>
              {url && (
                <button
                  onClick={() => setRepositioning(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-2 text-xs font-medium shadow-md backdrop-blur hover:bg-background"
                >
                  <Move className="h-3.5 w-3.5" /> Reposition
                </button>
              )}
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-2 text-xs font-medium shadow-md backdrop-blur hover:bg-background disabled:opacity-60"
              >
                <Camera className="h-3.5 w-3.5" /> {busy ? "Uploading…" : url ? "Change cover" : "Add cover photo"}
              </button>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
      )}
    </div>
  );
}
