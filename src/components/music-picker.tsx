import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchSpotify, type SpotifyTrack } from "@/lib/spotify.functions";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Music, X, Play, Pause, ExternalLink, MoreVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  value: SpotifyTrack | null;
  onChange: (t: SpotifyTrack | null) => void;
}

const SUGGESTIONS = [
  "Taylor Swift",
  "The Weeknd",
  "Billie Eilish",
  "Drake",
  "Adele",
  "Blinding Lights",
  "Levitating",
  "Anti-Hero",
];

export function MusicPicker({ value, onChange }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useServerFn(searchSpotify);
  const [showSuggestions, setShowSuggestions] = useState(true);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setError(null);
      setShowSuggestions(true);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await search({ data: { query: q.trim() } });
        setResults(r);
        setShowSuggestions(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to search Spotify right now.";
        setResults([]);
        setError(message);
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [q, search]);

  function handleSuggestion(term: string) {
    setQ(term);
    setShowSuggestions(false);
  }

  async function run() {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    try {
      const r = await search({ data: { query: term } });
      setResults(r);
      setShowSuggestions(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to search Spotify right now.";
      setResults([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border p-3">
        {value.artwork_url && <img src={value.artwork_url} alt="" className="h-10 w-10 rounded" />}
        <div className="flex-1 min-w-0 text-sm">
          <div className="truncate font-medium">{value.title}</div>
          <div className="truncate text-xs text-muted-foreground">{value.artist}</div>
        </div>
        <button onClick={() => onChange(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.slice(0, 5).map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => handleSuggestion(term)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            >
              {term}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Music className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), run())}
            placeholder="Search music"
            className="pl-9"
          />
        </div>
        <Button type="button" variant="outline" onClick={run} disabled={loading}>{loading ? "…" : "Search"}</Button>
      </div>
      {showSuggestions && q.trim().length < 2 && (
        <div className="rounded-3xl border border-border bg-background/80 p-3 text-sm text-muted-foreground">
          Start typing or tap a suggestion to search Spotify.
        </div>
      )}
      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-md border border-border">
          {results.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => onChange(t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(t);
                }
              }}
              className="flex w-full items-center gap-3 p-3 hover:bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              <div className="flex items-center gap-3 flex-1">
                {t.artwork_url ? (
                  <img src={t.artwork_url} alt="" className="h-12 w-12 rounded-md object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center"><Music className="h-5 w-5" /></div>
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.artist}{!t.preview_url && <span className="ml-1">· no preview</span>}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-1 text-muted-foreground" aria-label="more" onClick={(e) => e.stopPropagation()}><MoreVertical className="h-4 w-4" /></button>
                {t.preview_url ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (previewId === t.id) {
                        audioRef.current?.pause();
                        setPreviewId(null);
                        return;
                      }
                      if (audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current = null;
                      }
                      setLoadingPreviewId(t.id);
                      const audio = new Audio(t.preview_url ?? "");
                      audio.crossOrigin = "anonymous";
                      audioRef.current = audio;
                      audio.addEventListener("canplay", () => {
                        setLoadingPreviewId(null);
                        setPreviewId(t.id);
                      }, { once: true });
                      audio.addEventListener("ended", () => setPreviewId(null));
                      audio.addEventListener("error", () => {
                        setLoadingPreviewId(null);
                        setPreviewId(null);
                        audioRef.current = null;
                        toast.error("Preview failed to load");
                      });
                      audio.play().catch(() => {
                        setLoadingPreviewId(null);
                        setPreviewId(null);
                        toast.error("Tap play again to start preview");
                      });
                    }}
                    className="h-9 w-9 rounded-full bg-white/90 flex items-center justify-center shadow"
                    aria-label={previewId === t.id ? "Pause preview" : "Play preview"}
                  >
                    {loadingPreviewId === t.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : previewId === t.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); window.open(`https://open.spotify.com/track/${t.id}`, '_blank'); }}
                    className="h-9 w-9 rounded-full bg-white/90 flex items-center justify-center text-muted-foreground shadow"
                    aria-label="Open in Spotify"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && q && results.length === 0 && <p className="text-xs text-muted-foreground">{error ?? "No tracks found. Try a different search."}</p>}
    </div>
  );
}
