import { createFileRoute, Link } from "@tanstack/react-router";
import heroCreators from "@/assets/hero-creators.jpg";
import heroPhones from "@/assets/hero-phones.jpg";

export const Route = createFileRoute("/")({
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
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-[oklch(0.97_0.01_85)] text-foreground overflow-x-hidden">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-10 pb-8">
        {/* Top: logo + hero collage */}
        <div className="relative flex items-start justify-between">
          <div className="flex flex-col items-start">
            <LuminaMark />
            <h1 className="mt-4 font-serif text-5xl font-black tracking-[0.02em] text-neutral-900">
              LUMINA
            </h1>
          </div>
          <div className="relative -mr-2 h-40 w-52 shrink-0">
            <div className="absolute inset-0 overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
              <img
                src={heroCreators}
                alt="Creators connecting"
                width={1200}
                height={800}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="absolute -left-4 -top-3 text-3xl select-none">🔥</span>
            <span className="absolute -top-2 left-1/2 text-3xl select-none">👏</span>
            <span className="absolute -right-2 -top-2 text-3xl select-none">😂</span>
            <span className="absolute -bottom-2 left-2 text-3xl select-none">😄</span>
            <span className="absolute -bottom-3 -right-3 text-3xl select-none">😍</span>
          </div>
        </div>

        {/* Headline */}
        <div className="mt-14">
          <h2 className="font-sans text-[2.4rem] font-black leading-[1.05] tracking-tight text-neutral-900">
            A curated social<br />space for creators.
          </h2>
          <p className="mt-4 text-lg leading-snug text-neutral-700">
            Connect, share, and discover. Uncompressed, chronological, focused on community.
          </p>
        </div>

        {/* CTAs */}
        <div className="mt-8 space-y-3">
          <Link
            to="/auth"
            search={{ mode: "signup" as const }}
            className="block rounded-2xl bg-neutral-900 py-4 text-center text-base font-semibold text-[color:var(--ochre)] shadow-lg shadow-neutral-900/20 active:scale-[0.98] transition-transform"
          >
            Start Exploring
          </Link>
          <Link
            to="/auth"
            className="block rounded-2xl border-2 border-violet-500/60 bg-transparent py-4 text-center text-base font-semibold text-violet-600 active:scale-[0.98] transition-transform"
          >
            Log In
          </Link>
        </div>

        {/* Bottom hero collage */}
        <div className="relative mt-10 flex-1">
          <div className="relative h-56 w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
            <img
              src={heroPhones}
              alt="Sharing photos"
              width={1200}
              height={700}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
          <span className="absolute -top-3 left-6 text-3xl select-none">🔥</span>
          <span className="absolute -top-4 left-1/3 text-3xl select-none">👏</span>
          <span className="absolute -top-3 left-1/2 text-3xl select-none">😂</span>
          <span className="absolute -top-2 right-1/4 text-3xl select-none">😍</span>
          <span className="absolute bottom-4 left-1/3 text-3xl select-none">📷</span>
          <span className="absolute bottom-6 right-6 text-3xl select-none">❤️</span>
        </div>
      </div>
    </div>
  );
}

function LuminaMark() {
  return (
    <div className="relative">
      <div
        className="grid h-16 w-16 place-items-center rounded-2xl text-white shadow-xl"
        style={{
          background: "linear-gradient(145deg, #2a2a2a 0%, #0a0a0a 55%, #1a1a1a 100%)",
          boxShadow: "inset 2px 2px 4px rgba(255,255,255,0.1), inset -2px -2px 4px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        <span className="font-serif text-3xl font-black" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>L</span>
      </div>
      <span className="absolute -right-1 top-2 h-2 w-2 rounded-full bg-neutral-700 shadow" />
      <span className="absolute -right-3 top-6 h-2.5 w-2.5 rounded-full bg-neutral-500 shadow" />
      <span className="absolute -right-1 top-10 h-2 w-2 rounded-full bg-neutral-800 shadow" />
    </div>
  );
}
