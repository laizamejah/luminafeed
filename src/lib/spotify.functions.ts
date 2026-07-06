import { createServerFn } from "@tanstack/react-start";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before restarting the app.");
  const basic = typeof Buffer !== "undefined" ? Buffer.from(`${id}:${secret}`).toString("base64") : (typeof btoa !== "undefined" ? btoa(`${id}:${secret}`) : "");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify auth failed (${res.status})${text ? `: ${text}` : ""}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

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
    const res = await fetch(url);
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
    try {
      const token = await getSpotifyToken();
      const params = new URLSearchParams({ q, type: "track", market: "US" });
      params.set("limit", "20");
      const [spotifyRes, itunesResults] = await Promise.all([
        fetch(`https://api.spotify.com/v1/search?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetchItunesPreviews(q),
      ]);
      if (!spotifyRes.ok) {
        const text = await spotifyRes.text();
        throw new Error(`Spotify search failed (${spotifyRes.status})${text ? `: ${text}` : ""}`);
      }
      const json = (await spotifyRes.json()) as {
        tracks?: {
          items?: Array<{
            id: string;
            name: string;
            preview_url: string | null;
            artists: Array<{ name: string }>;
            album: { images: Array<{ url: string }> };
          }>;
        };
      };

      const itunesByKey = new Map<string, string>();
      for (const it of itunesResults) {
        if (!it.previewUrl) continue;
        const key = `${normalize(it.trackName)}::${normalize(it.artistName)}`;
        if (!itunesByKey.has(key)) itunesByKey.set(key, it.previewUrl);
        const titleOnly = normalize(it.trackName);
        if (!itunesByKey.has(titleOnly)) itunesByKey.set(titleOnly, it.previewUrl);
      }

      return (json.tracks?.items ?? []).map((t) => {
        const firstArtist = t.artists[0]?.name ?? "";
        const preview =
          t.preview_url ??
          itunesByKey.get(`${normalize(t.name)}::${normalize(firstArtist)}`) ??
          itunesByKey.get(normalize(t.name)) ??
          null;
        return {
          id: t.id,
          title: t.name,
          artist: t.artists.map((a) => a.name).join(", "),
          artwork_url: t.album.images[t.album.images.length - 1]?.url ?? null,
          preview_url: preview,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Spotify search failed";
      console.error("spotify search failed", err);
      throw new Error(message);
    }
  });
