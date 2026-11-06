import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import loginCharacter from "@/assets/login-creative-character-cutout.png";
import { toast } from "sonner";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in to Lumina" },
      { name: "description", content: "Sign in or create your Lumina account to share and discover photography." },
      { property: "og:title", content: "Sign in to Lumina" },
      { property: "og:description", content: "Sign in or create your Lumina account to share and discover photography." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/feed" });
  },
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const nav = useNavigate();

  async function handleForgotPassword() {
    if (!email) return toast.error("Enter your email above first");
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent. Check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setSendingReset(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/feed`,
            data: { username: username || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Welcome to Lumina. Check your inbox to confirm your address.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: "/feed" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      nav({ to: "/feed" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${provider} sign-in failed`);
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-shell">
        <header className="auth-topline">
          <Link to="/" className="auth-brand" aria-label="Lumina home">LUMINA<span>.</span></Link>
          <span className="auth-top-note">A home for your point of view</span>
        </header>

        <div className="auth-heading">
          <h1><span>Creative</span> {mode === "signin" ? "Login" : "Sign up"} to Lumina</h1>
          <p>Make room for your point of view.</p>
        </div>

        <div className="auth-stage">
          <section className="auth-visual" aria-label="A space for photography">
            <div className="auth-visual-copy">
              <p className="auth-kicker">A space for photography</p>
              <h2>Every frame<br />has a story.</h2>
              <p className="auth-visual-note">Find your people. Share what moves you.</p>
            </div>
            <img
              src={loginCharacter}
              alt="A creative welcoming you to Lumina"
              width={768}
              height={1024}
              fetchPriority="high"
              className="auth-character"
            />
            <span className="auth-image-caption">PHOTOGRAPHY, IN ITS BEST LIGHT</span>
          </section>

          <section className="auth-form-area" aria-labelledby="auth-form-title">
            <div className="auth-form-heading">
              <p className="auth-kicker">{mode === "signin" ? "WELCOME BACK" : "YOUR NEXT CHAPTER"}</p>
              <h2 id="auth-form-title">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
              <p>{mode === "signin" ? "Pick up where your inspiration left off." : "Join a community that sees things differently."}</p>
            </div>

            <form onSubmit={handleEmail} className="auth-form">
              {mode === "signup" && (
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="Username"
                  aria-label="Username"
                  autoComplete="username"
                  maxLength={30}
                  className="auth-input"
                />
              )}
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                aria-label="Email address"
                autoComplete="email"
                className="auth-input"
              />
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="auth-input"
              />

              {mode === "signin" && (
                <div className="auth-forgot-row">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleForgotPassword}
                    disabled={sendingReset}
                    className="auth-forgot"
                  >
                    {sendingReset ? "Sending…" : "Forgot password?"}
                  </Button>
                </div>
              )}

              <Button type="submit" disabled={loading} className="auth-submit">
                {loading ? "Please wait…" : mode === "signin" ? "Login" : "Create account"}
              </Button>
            </form>

            <div className="auth-divider"><span>or continue with</span></div>
            <div className="auth-providers">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOAuth("google")}
                disabled={loading}
                className="auth-provider"
              >
                <GoogleG className="h-5 w-5" />
                <span>Google</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOAuth("apple")}
                disabled={loading}
                className="auth-provider"
              >
                <AppleIcon className="h-5 w-5" />
                <span>Apple</span>
              </Button>
            </div>

            <p className="auth-mode-switch">
              {mode === "signin" ? "New to Lumina?" : "Already part of Lumina?"}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="auth-mode-button"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </Button>
            </p>
          </section>
        </div>
        <footer className="auth-footer">LUMINA <span>·</span> MAKE SOMETHING WORTH REMEMBERING</footer>
      </div>
    </main>
  );
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.68 4.1-5.5 4.1-3.3 0-6-2.74-6-6.1s2.7-6.1 6-6.1c1.88 0 3.14.8 3.86 1.5l2.63-2.53C16.86 3.4 14.66 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12S6.76 21.5 12 21.5c6.92 0 9.5-4.86 9.5-9.37 0-.63-.07-1.11-.16-1.58H12z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 12.6c-.03-2.6 2.13-3.86 2.23-3.92-1.22-1.78-3.11-2.02-3.79-2.05-1.61-.16-3.15.95-3.97.95-.83 0-2.08-.93-3.42-.9-1.76.03-3.38 1.02-4.28 2.6-1.83 3.17-.47 7.86 1.31 10.43.87 1.26 1.9 2.67 3.24 2.62 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.4.81 1.4-.02 2.29-1.28 3.15-2.55 1-1.46 1.41-2.87 1.43-2.94-.03-.02-2.74-1.05-2.77-4.17zm-2.6-7.66c.71-.87 1.2-2.07 1.06-3.27-1.03.04-2.28.68-3.02 1.54-.66.77-1.24 2-1.09 3.17 1.15.09 2.34-.58 3.05-1.44z" />
    </svg>
  );
}
