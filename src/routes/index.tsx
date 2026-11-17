import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Lumina — A curated social space for creators" },
      { name: "description", content: "Connect, share, and discover. Uncompressed, chronological, focused on community." },
      { property: "og:title", content: "Lumina — A curated social space for creators" },
      { property: "og:description", content: "Connect, share, and discover. Uncompressed, chronological, focused on community." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => null,
});
