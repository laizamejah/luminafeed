import { createServerFn } from "@tanstack/react-start";

export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  artwork_url: string | null;
  preview_url: string | null;
}

interface ItunesTrack {
  trackName: string;
  artistName: string;
  previewUrl?: string;
}

async function fetchItunesPreviews(query: string): Promise<ItunesTrack[]> {
  try {
    const url = `https://itunes.apple.com/search?media=music&entity=song&limit=50&term=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Lumina/1.0" } });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: ItunesTrack[] };
    return json.results ?? [];
  } catch {
    return [];
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, "").trim();
}

export const searchSpotify = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string }) => data)
  .handler(async ({ data }): Promise<SpotifyTrack[]> => {
    const q = data.query.trim();
    if (!q) return [];
    // Apple Music (iTunes Search) is the primary source: free, no account needed, includes previews.
    const results = (await fetchItunesPreviews(q)) as Array<ItunesTrack & { trackId?: number; artworkUrl100?: string }>;
    return results
      .filter((it) => it.previewUrl)
      .slice(0, 40)
      .map((it, i) => ({
        id: `itunes-${it.trackId ?? i}`,
        title: it.trackName,
        artist: it.artistName,
        artwork_url: it.artworkUrl100 ? it.artworkUrl100.replace("100x100", "300x300") : null,
        preview_url: it.previewUrl ?? null,
      }));
  });
