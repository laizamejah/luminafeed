import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Play, Radio, PlusSquare, Music, User, Search, Bell, MessageCircle, Map, ShoppingBag, Baby, Settings as SettingsIcon, MoreVertical, Shield, Heart, Send, Plus, ChevronDown, Menu } from "lucide-react";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentProfile, useKidStatus } from "@/hooks/use-current-user";
import { useIsAdmin } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "./theme-provider";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "./ui/sheet";


const desktopNav = [
  { to: "/feed" as const, label: "Feed", icon: Home },
  { to: "/search" as const, label: "Search", icon: Search },
  { to: "/reels" as const, label: "Reels", icon: Play },
  { to: "/live" as const, label: "Live", icon: Radio },
  { to: "/discover" as const, label: "Discover", icon: Map },
  { to: "/create" as const, label: "Create", icon: PlusSquare },
  { to: "/market" as const, label: "Market", icon: ShoppingBag },
  { to: "/messages" as const, label: "Messages", icon: MessageCircle, badgeKey: "messages" as const },
  { to: "/notifications" as const, label: "Notifications", icon: Bell, badgeKey: "notifications" as const },
  { to: "/me" as const, label: "Profile", icon: User },
];

const mobileBottomNav = [
  { to: "/feed" as const, label: "Home", icon: Home },
  { to: "/reels" as const, label: "Reels", icon: Play },
  { to: "/live" as const, label: "Live", icon: Radio },
  { to: "/create" as const, label: "Create", icon: PlusSquare, prominent: true },
  { to: "/search" as const, label: "Music", icon: Music },
  { to: "/me" as const, label: "Profile", icon: User },
];

const feedBottomNav = [
  { to: "/feed" as const, label: "Home", icon: Home },
  { to: "/reels" as const, label: "Reels", icon: Play },
  { to: "/messages" as const, label: "Messages", icon: Send, badgeKey: "messages" as const },
  { to: "/search" as const, label: "Search", icon: Search },
  { to: "/me" as const, label: "Profile", icon: User },
];

function useCounts() {
  const { data: me } = useCurrentProfile();
  const qc = useQueryClient();

  const notif = useQuery({
    queryKey: ["notifications-unread", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", me!.id)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const msgs = useQuery({
    queryKey: ["messages-unread", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", me!.id)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel(`shell-${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications-unread"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${me.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["messages-unread"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, qc]);

  return { notifications: notif.data ?? 0, messages: msgs.data ?? 0 };
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold grid place-items-center leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useCurrentProfile();
  const { isKid } = useKidStatus();
  const { data: isAdmin } = useIsAdmin();
  const counts = useCounts();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isSettings = pathname === "/settings";

  const isActive = (to: string) => {
    if (to === "/me") return me ? pathname === `/u/${me.username}` : false;
    return pathname === to || pathname.startsWith(to + "/");
  };

  const badgeFor = (key?: "messages" | "notifications") =>
    key === "messages" ? counts.messages : key === "notifications" ? counts.notifications : 0;

  // Close mobile nav on route change
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  if (me && (me as { suspended?: boolean }).suspended) {
    return (
      <div className="min-h-screen bg-background grid place-items-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="font-serif text-3xl">Account suspended</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your Lumina account has been suspended by an administrator. Contact support if you believe this is a mistake.
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 rounded-xl border border-border px-4 py-2 text-sm hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <>
      <Link to="/feed"><Logo /></Link>
      <div className="flex-1 min-h-0 flex flex-col justify-start w-full overflow-y-auto">
        <nav className="flex flex-col gap-1 w-full items-start">
        {desktopNav.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          const b = badgeFor(item.badgeKey);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all justify-start",
                active
                  ? "bg-white/10 text-foreground border border-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5",
              )}
            >
              <span className="relative">
                <Icon className="h-[18px] w-[18px]" />
                <Badge count={b} />
              </span>
              <span className="inline">{item.label}</span>
            </Link>
          );
        })}
        {me && !isKid && (
          <Link
            to="/kids"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all justify-start",
              isActive("/kids") ? "bg-white/10 text-foreground border border-white/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
          >
            <Baby className="h-[18px] w-[18px]" />
            <span className="inline">Kids setup</span>
          </Link>
        )}
        {isAdmin && (
          <Link
            to="/admin"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all justify-start",
              isActive("/admin") ? "bg-white/10 text-foreground border border-white/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
          >
            <Shield className="h-[18px] w-[18px]" />
            <span className="inline">Admin</span>
          </Link>
        )}
        </nav>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Link to="/settings" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <SettingsIcon className="h-3.5 w-3.5" /> Settings
        </Link>
        <ThemeToggle />
      </div>
    </>
  );

  return (
    <div
      className="min-h-screen w-full max-w-full overflow-x-clip bg-background lg:pl-64"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: isSettings ? "env(safe-area-inset-bottom)" : "calc(5.5rem + env(safe-area-inset-bottom))",
      }}
    >
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col liquid-glass px-6 py-6 overflow-y-auto" style={{ position: "fixed" }}>
        {sidebarContent}
      </aside>

      {/* Mobile top bar — liquid glass, truly fixed */}
      {!isSettings && (
        <header
          className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl px-4"
          style={{ position: "fixed", paddingTop: "env(safe-area-inset-top)", height: "calc(3.75rem + env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-3">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button aria-label="Open menu" className="p-1 -ml-1 text-foreground hover:bg-secondary/60 rounded-lg transition-colors">
                  <Menu className="h-6 w-6" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 p-6 border-r border-border bg-background/95 backdrop-blur-xl flex flex-col h-full overflow-hidden"
              >
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                {sidebarContent}
              </SheetContent>
            </Sheet>
            <Link to="/feed" className="flex items-center gap-1">
              <Logo className="text-2xl font-bold" />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/create" aria-label="Create" className="p-2 text-foreground hover:bg-secondary/60 rounded-lg">
              <PlusSquare className="h-6 w-6" />
            </Link>
            <Link to="/notifications" aria-label="Notifications" className="relative p-2 text-foreground hover:bg-secondary/60 rounded-lg">
              <Heart className="h-6 w-6" />
              <Badge count={counts.notifications} />
            </Link>
            <Link to="/messages" aria-label="Messages" className="relative p-2 text-foreground hover:bg-secondary/60 rounded-lg">
              <Send className="h-6 w-6" />
              <Badge count={counts.messages} />
            </Link>
          </div>
        </header>
      )}

      <main className={cn("w-full max-w-full overflow-x-clip lg:pt-0", isSettings ? "pt-0" : "pt-14 lg:pt-0")}>
        {children}
      </main>

      {/* Mobile bottom bar — liquid glass, safe-area aware */}
      {!isSettings && <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background/80 backdrop-blur-xl border-t border-border"
        style={{ position: "fixed", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-lg items-center grid-cols-5 h-16">
          {[
            { to: "/feed" as const, label: "Home", icon: Home },
            { to: "/reels" as const, label: "Reels", icon: Play },
            { to: "/discover" as const, label: "Map", icon: Map },
            { to: "/search" as const, label: "Search", icon: Search },
            { to: "/me" as const, label: "Profile", icon: User },
          ].map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex flex-col items-center justify-center h-full transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={item.label}
              >
                <Icon className={cn("h-6 w-6", active && "fill-current")} />
              </Link>
            );
          })}
        </div>
      </nav>}
    </div>
  );
}
