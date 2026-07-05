import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/kids")({
  component: KidsSetup,
});

function KidsSetup() {
  const { data: user } = useCurrentUser();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const year = parseInt(birthYear, 10);
    const currentYear = new Date().getFullYear();
    if (!year || year < currentYear - 17 || year > currentYear - 5) return toast.error("Child must be 5–17 years old");
    if (!consent) return toast.error("Parental consent is required");

    setLoading(true);
    const parentSession = (await supabase.auth.getSession()).data.session;
    try {
      // Sign up child as a new auth user. This signs them in and replaces the parent's session locally.
      const { data: signUp, error: signErr } = await supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: `${window.location.origin}/feed`,
          data: { username: username || email.split("@")[0], display_name: displayName || username },
        },
      });
      if (signErr) throw signErr;

      const childId = signUp.user?.id;
      if (childId) {
        // Wait for the auto-created profile trigger, then flag it as a kid account.
        await new Promise((r) => setTimeout(r, 400));
        await supabase.from("profiles").update({
          is_kid: true,
          birth_year: year,
          parent_id: user.id,
          display_name: displayName || null,
        }).eq("id", childId);
      }

      // Restore parent's session locally so the parent stays signed in.
      if (parentSession) {
        await supabase.auth.setSession({
          access_token: parentSession.access_token,
          refresh_token: parentSession.refresh_token,
        });
      }
      toast.success("Child account created. They can sign in with their own email.");
      nav({ to: "/settings" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create child account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="font-serif text-3xl">Kids account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Register a child under 18. Their feed and reels will only show posts creators have marked as kid-safe. You'll remain linked as their parent/guardian.
      </p>

      <form onSubmit={register} className="mt-8 space-y-4">
        <div>
          <Label>Child's display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required />
        </div>
        <div>
          <Label>Username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} maxLength={30} required />
        </div>
        <div>
          <Label>Birth year</Label>
          <Input type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} min={new Date().getFullYear() - 17} max={new Date().getFullYear() - 5} required />
        </div>
        <div>
          <Label>Child's email (for sign-in)</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
          <span>I am the parent or legal guardian and I consent to this account under my supervision.</span>
        </label>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Creating…" : "Create child account"}
        </Button>
      </form>
    </div>
  );
}
