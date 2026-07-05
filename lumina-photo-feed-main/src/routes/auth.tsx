import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  ssr: false,
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
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-5 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-2xl border border-white/10">
            <span className="font-serif text-4xl font-bold text-white">L</span>
            <span className="absolute -right-2 top-1/2 -translate-y-1/2 flex gap-0.5">
              <span className="h-2 w-2 rounded-full bg-neutral-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-neutral-400" />
              <span className="h-2 w-2 rounded-full bg-neutral-600" />
            </span>
          </div>
          <h1 className="font-serif text-5xl tracking-[0.15em] text-neutral-100">LUMINA</h1>
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          {mode === "signup" && (
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="Username"
              maxLength={30}
              className="h-12 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-neutral-500 backdrop-blur-md focus-visible:ring-white/20"
            />
          )}
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Username or Email"
            className="h-12 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-neutral-500 backdrop-blur-md focus-visible:ring-white/20"
          />
          <Input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="h-12 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-neutral-500 backdrop-blur-md focus-visible:ring-white/20"
          />

          {mode === "signin" && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={sendingReset}
                className="text-xs text-neutral-400 hover:text-white transition-colors"
              >
                {sendingReset ? "Sending…" : "Forgot Password?"}
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-white text-black font-medium hover:bg-neutral-200"
          >
            {mode === "signin" ? "Login" : "Create account"}
          </Button>
        </form>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={loading}
            className="w-full h-12 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md text-white flex items-center justify-center gap-3 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <GoogleG className="h-5 w-5" />
            <span className="text-sm font-medium">Sign in with Google</span>
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("apple")}
            disabled={loading}
            className="w-full h-12 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md text-white flex items-center justify-center gap-3 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <AppleIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Sign in with Apple</span>
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-neutral-400">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-semibold text-white hover:underline"
          >
            {mode === "signin" ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
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
