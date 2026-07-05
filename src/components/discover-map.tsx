import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { FeedPost } from "@/components/post-card";

// Fix default icon issue
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const pinIcon = L.divIcon({
  className: "lumina-pin",
  html: `<div style="width:14px;height:14px;border-radius:9999px;background:oklch(0.68 0.12 62);box-shadow:0 0 0 3px oklch(0.985 0.008 85), 0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 6); return; }
    map.fitBounds(points, { padding: [40, 40], maxZoom: 10 });
  }, [map, points]);
  return null;
}

export function DiscoverMap({ posts, onSelect }: { posts: FeedPost[]; onSelect: (p: FeedPost) => void }) {
  const points = posts
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => [p.latitude!, p.longitude!] as [number, number]);

  return (
    <MapContainer center={[20, 0]} zoom={2} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {posts.map((p) =>
        p.latitude != null && p.longitude != null ? (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={pinIcon}
            eventHandlers={{ click: () => onSelect(p) }}
          />
        ) : null,
      )}
      <FitBounds points={points} />
    </MapContainer>
  );
}
