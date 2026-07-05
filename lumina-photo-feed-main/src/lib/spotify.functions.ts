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

export const searchSpotify = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string }) => data)
  .handler(async ({ data }): Promise<SpotifyTrack[]> => {
    const q = data.query.trim();
    if (!q) return [];
    try {
      const token = await getSpotifyToken();
      const params = new URLSearchParams({ q, type: "track", market: "US" });
      const requestUrl = `https://api.spotify.com/v1/search?${params.toString()}`;
      console.log("spotify search request:", requestUrl);
      const res = await fetch(requestUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Spotify search failed (${res.status})${text ? `: ${text}` : ""}`);
      }
      const json = (await res.json()) as {
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
      return (json.tracks?.items ?? []).map((t) => ({
        id: t.id,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        artwork_url: t.album.images[t.album.images.length - 1]?.url ?? null,
        preview_url: t.preview_url,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Spotify search failed";
      console.error("spotify search failed", err);
      throw new Error(message);
    }
  });
