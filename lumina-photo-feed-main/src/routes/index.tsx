import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumina — Photography, undiluted." },
      { name: "description", content: "A quiet social space for photographers. Uncompressed images, chronological feeds, no algorithms." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex items-center gap-6 text-sm">
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">Sign in</Link>
          <Link to="/auth" search={{ mode: "signup" as const }} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Join</Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-24 pb-32">
        <p className="mb-6 text-xs uppercase tracking-[0.25em] text-muted-foreground">Est. 2026 · Invite the light</p>
        <h1 className="font-serif text-6xl leading-[0.95] md:text-8xl">
          Photography,<br />
          <span className="italic text-[color:var(--ochre)]">undiluted.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg text-muted-foreground">
          A quiet social space for image-makers. Uncompressed uploads. Any aspect ratio.
          A strictly chronological feed of the people you actually chose to follow.
        </p>
        <div className="mt-10 flex gap-3">
          <Link to="/auth" search={{ mode: "signup" as const }} className="rounded-md bg-primary px-6 py-3 text-sm text-primary-foreground">Create account</Link>
          <Link to="/auth" className="rounded-md border border-border px-6 py-3 text-sm">Sign in</Link>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-3">
          {[
            { t: "No algorithm", d: "Your feed is chronological. Filter by close friends, acquaintances, or everyone." },
            { t: "No compression", d: "High-fidelity uploads. Any aspect ratio, rendered exactly as you framed it." },
            { t: "No pressure", d: "Like counts and follower numbers are hidden by default. Post for yourself." },
          ].map((f) => (
            <div key={f.t}>
              <h3 className="font-serif text-2xl">{f.t}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
