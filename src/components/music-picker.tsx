import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchSpotify, type SpotifyTrack } from "@/lib/spotify.functions";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Music, X, Play, Pause, ExternalLink, MoreVertical, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  value: SpotifyTrack | null;
  onChange: (t: SpotifyTrack | null) => void;
}

const CATEGORIES = [
  { id: "for-you", label: "For You" },
  { id: "browse", label: "Browse" },
  { id: "saved", label: "Saved" },
];

const SUGGESTIONS = [
  "Taylor Swift",
  "The Weeknd",
  "Billie Eilish",
  "Drake",
  "Adele",
  "Pop",
  "Hip Hop",
  "Rock",
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
  const [activeCategory, setActiveCategory] = useState("for-you");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      if (!showResults) setResults([]);
      setError(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await search({ data: { query: q.trim() } });
        setResults(r);
        setShowResults(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to search Spotify right now.";
        setResults([]);
        setError(message);
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [q, search, showResults]);

  function handleSuggestion(term: string) {
    setQ(term);
    setShowResults(true);
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 p-4 animate-in fade-in zoom-in duration-200">
        {value.artwork_url ? (
          <img src={value.artwork_url} alt="" className="h-12 w-12 rounded-lg shadow-sm" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><Music className="h-6 w-6 text-primary" /></div>
        )}
        <div className="flex-1 min-w-0">
          <div className="truncate font-semibold text-sm">{value.title}</div>
          <div className="truncate text-xs text-muted-foreground">{value.artist}</div>
        </div>
        <button 
          onClick={() => onChange(null)} 
          className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Remove music"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[60vh] flex flex-col">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.length === 0) setShowResults(false);
          }}
          placeholder="Search music"
          className="pl-10 h-11 rounded-full bg-secondary/40 border-none focus-visible:ring-primary"
        />
        {q && (
          <button 
            onClick={() => { setQ(""); setShowResults(false); }} 
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!showResults ? (
        <>
          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                  activeCategory === cat.id 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Suggestions/Genres */}
          <div className="flex-1 overflow-y-auto pr-1">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Recommended for you</h3>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => handleSuggestion(term)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                >
                  <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
                    <Music className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium truncate">{term}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Results List */
        <div className="flex-1 overflow-y-auto divide-y divide-border/50 rounded-xl border border-border bg-card">
          {loading && results.length === 0 && (
            <div className="p-8 text-center flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Searching Spotify...</p>
            </div>
          )}
          
          {results.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => onChange(t)}
              className="flex w-full items-center gap-3 p-3 hover:bg-secondary/40 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-primary cursor-pointer transition-colors"
            >
              <div className="relative group shrink-0">
                {t.artwork_url ? (
                  <img src={t.artwork_url} alt="" className="h-14 w-14 rounded-lg object-cover shadow-sm" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center"><Music className="h-6 w-6" /></div>
                )}
                
                {t.preview_url && (
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
                        toast.error("Preview failed to load");
                      });
                      audio.play().catch(() => {
                        setLoadingPreviewId(null);
                        setPreviewId(null);
                        toast.error("Tap again to play preview");
                      });
                    }}
                    className={cn(
                      "absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity",
                      previewId === t.id && "opacity-100"
                    )}
                  >
                    {loadingPreviewId === t.id ? (
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    ) : previewId === t.id ? (
                      <Pause className="h-5 w-5 text-white" />
                    ) : (
                      <Play className="h-5 w-5 text-white" />
                    )}
                  </button>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="truncate font-semibold text-sm">{t.title}</div>
                <div className="truncate text-xs text-muted-foreground">{t.artist}{!t.preview_url && " • No preview"}</div>
              </div>
              
              {!t.preview_url && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); window.open(`https://open.spotify.com/track/${t.id}`, '_blank'); }}
                  className="p-2 text-muted-foreground hover:text-foreground"
                  aria-label="Open in Spotify"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          
          {!loading && results.length === 0 && q.length >= 2 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {error ?? "No tracks found matching your search."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
