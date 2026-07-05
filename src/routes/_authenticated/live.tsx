import { createFileRoute } from "@tanstack/react-router";
import { Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/live")({
  head: () => ({
    meta: [
      { title: "Live • Lumina" },
      { name: "description", content: "Live streaming on Lumina — coming soon." },
    ],
  }),
  component: LivePage,
});

function LivePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
        <Radio className="h-7 w-7 text-primary" />
      </div>
      <h1 className="font-serif text-3xl">Live is coming soon.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Real-time broadcasts from the photographers you follow. We're building it thoughtfully — check back soon.
      </p>
    </div>
  );
}
