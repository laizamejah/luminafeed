import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accessibility, Activity, Archive, AtSign, BadgeCheck, Ban, Bell, Bookmark,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, Download, EyeOff, FileText,
  HeartOff, Image, Info, Languages, LayoutGrid, Lock, MessageCircle, Moon,
  Package, Palette, Search, Send, Shield, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Smartphone, Star, Sun, UserPlus, Users, VolumeX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile, useCurrentUser } from "@/hooks/use-current-user";
import { AvatarImage } from "@/components/avatar-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Settings and activity — Lumina" },
    { name: "description", content: "Manage your Lumina account, privacy, content, messages, media and family settings." },
    { property: "og:title", content: "Settings and activity — Lumina" },
    { property: "og:description", content: "Manage your Lumina account, privacy, content, messages, media and family settings." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});

type View = "menu" | "account" | "activity" | "privacy" | "close-friends" | "blocked" | "messages" | "comments" | "content" | "appearance" | "media" | "accessibility" | "language" | "orders" | "help" | "privacy-centre" | "status" | "about";
type Icon = ComponentType<{ className?: string }>;
type Row = { label: string; icon: Icon; view?: View; to?: "/notifications" | "/messages" | "/search" | "/feed" | "/create" | "/kids" | "/market"; value?: string; description?: string };
type Section = { title: string; rows: Row[] };

function SettingsPage() {
  const navigate = useNavigate();
  const { data: me } = useCurrentProfile();
  const { data: user } = useCurrentUser();
  const [view, setView] = useState<View>("menu");
  const [search, setSearch] = useState("");

  const { data: closeCount = 0 } = useQuery({
    queryKey: ["settings-close-friends", user?.id], enabled: !!user,
    queryFn: async () => { const { count } = await supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", user?.id ?? "").eq("tier", "close_friend"); return count ?? 0; },
  });
  const { data: blockedCount = 0 } = useQuery({
    queryKey: ["settings-blocked", user?.id], enabled: !!user,
    queryFn: async () => { const { count } = await supabase.from("blocked_users").select("blocked_id", { count: "exact", head: true }).eq("blocker_id", user?.id ?? ""); return count ?? 0; },
  });

  const sections: Section[] = [
    { title: "Your account", rows: [
      { label: "Lumina Account", description: "Password, security and personal details", icon: ShieldCheck, view: "account" },
      { label: "Appearance", icon: Palette, view: "appearance", value: me?.theme_preference === "dark" ? "Dark" : "Light" },
    ]},
    { title: "How you use Lumina", rows: [
      { label: "Your activity", icon: Activity, view: "activity" },
      { label: "Notifications", icon: Bell, to: "/notifications" },
      { label: "Archived chats", icon: Archive, to: "/messages", value: "Open" },
      { label: "Time management", icon: Clock3, view: "accessibility" },
    ]},
    { title: "Who can see your content", rows: [
      { label: "Account privacy", icon: Lock, view: "privacy", value: me?.hide_public_counts ? "Limited" : "Public" },
      { label: "Close Friends", icon: Star, view: "close-friends", value: String(closeCount) },
      { label: "Blocked", icon: Ban, view: "blocked", value: String(blockedCount) },
      { label: "Story, live and location", icon: EyeOff, to: "/create" },
      { label: "Activity in Friends feed", icon: Users, to: "/feed" },
    ]},
    { title: "How others can interact with you", rows: [
      { label: "Messages and story replies", icon: Send, view: "messages" },
      { label: "Tags and mentions", icon: AtSign, view: "comments" },
      { label: "Comments", icon: MessageCircle, view: "comments" },
      { label: "Sharing", icon: Send, view: "help" },
      { label: "Follow and invite friends", icon: UserPlus, to: "/search" },
    ]},
    { title: "What you see", rows: [
      { label: "Close Friends feed", icon: Star, to: "/feed" },
      { label: "Muted short videos", icon: VolumeX, view: "content", value: me?.hide_reels ? "On" : "Off" },
      { label: "Content preferences", icon: SlidersHorizontal, view: "content" },
      { label: "Like and share counts", icon: HeartOff, view: "privacy" },
    ]},
    { title: "Your app and media", rows: [
      { label: "Device permissions", icon: Smartphone, view: "media" },
      { label: "Archiving and downloading", icon: Download, view: "media" },
      { label: "Accessibility", icon: Accessibility, view: "accessibility" },
      { label: "Language", icon: Languages, view: "language", value: "English" },
      { label: "Media quality", icon: Image, view: "media" },
      { label: "App appearance", icon: Moon, view: "appearance" },
    ]},
    { title: "Family Centre", rows: [
      { label: "Supervision for Teen Accounts", icon: Users, to: "/kids" },
    ]},
    { title: "Your insights and tools", rows: [
      { label: "Account type and seller tools", icon: LayoutGrid, to: "/market" },
    ]},
    { title: "Your orders", rows: [
      { label: "Orders and payments", icon: Package, view: "orders" },
    ]},
    { title: "More info and support", rows: [
      { label: "Help", icon: CircleHelp, view: "help" },
      { label: "Privacy Centre", icon: Shield, view: "privacy-centre" },
      { label: "Account Status", icon: BadgeCheck, view: "status" },
      { label: "About", icon: Info, view: "about" },
    ]},
  ];

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sections;
    return sections.map((section) => ({ ...section, rows: section.rows.filter((row) => `${row.label} ${row.description ?? ""}`.toLowerCase().includes(q)) })).filter((section) => section.rows.length);
  }, [search, me?.hide_reels, me?.hide_public_counts, me?.theme_preference, closeCount, blockedCount]);

  const goBack = () => view === "menu" ? navigate({ to: "/me" }) : setView("menu");
  return (
    <div className="min-h-screen bg-background md:bg-muted/35">
      <div className="mx-auto min-h-screen w-full max-w-2xl bg-background md:border-x md:border-border">
        <SettingsHeader title={view === "menu" ? "Settings and activity" : viewTitle(view)} onBack={goBack} />
        {view === "menu" ? (
          <>
            <div className="px-4 py-4 md:px-6">
              <label className="flex h-12 items-center gap-3 rounded-xl bg-muted px-4 text-muted-foreground">
                <Search className="h-5 w-5" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground" />
              </label>
            </div>
            {matching.map((section) => <SettingsSection key={section.title} section={section} onOpen={setView} />)}
            <div className="h-8" />
          </>
        ) : <DetailView view={view} me={me} userEmail={user?.email ?? ""} onDone={() => setView("menu")} />}
      </div>
    </div>
  );
}

function SettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/95 px-3 backdrop-blur-xl">
    <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back"><ChevronLeft className="h-7 w-7" /></Button>
    <h1 className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-sans text-base font-bold md:text-lg">{title}</h1>
  </header>;
}

function SettingsSection({ section, onOpen }: { section: Section; onOpen: (view: View) => void }) {
  return <section className="border-b-[10px] border-muted px-4 py-5 md:px-6">
    <h2 className="mb-3 font-sans text-sm font-semibold text-muted-foreground">{section.title}</h2>
    <div>{section.rows.map((row) => <SettingsRow key={row.label} row={row} onOpen={onOpen} />)}</div>
  </section>;
}

function SettingsRow({ row, onOpen }: { row: Row; onOpen: (view: View) => void }) {
  const content = <><row.icon className="h-6 w-6 shrink-0 stroke-[1.8]" /><span className="min-w-0 flex-1 text-left"><span className="block text-[15px] leading-5">{row.label}</span>{row.description && <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{row.description}</span>}</span>{row.value && <span className="max-w-28 truncate text-sm text-muted-foreground">{row.value}</span>}<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" /></>;
  const classes = "flex min-h-14 w-full items-center gap-4 px-0 py-2 text-foreground transition-colors hover:bg-muted/60";
  if (row.to) return <Link to={row.to} className={classes}>{content}</Link>;
  return <Button variant="ghost" className={`${classes} h-auto justify-start rounded-none`} onClick={() => row.view && onOpen(row.view)}>{content}</Button>;
}

function viewTitle(view: View) {
  return ({ account: "Lumina Account", activity: "Your activity", privacy: "Account privacy", "close-friends": "Close Friends", blocked: "Blocked", messages: "Messages and replies", comments: "Interactions", content: "Content preferences", appearance: "Appearance", media: "App and media", accessibility: "Accessibility and time", language: "Language", orders: "Orders and payments", help: "Help", "privacy-centre": "Privacy Centre", status: "Account Status", about: "About Lumina", menu: "Settings and activity" } as Record<View, string>)[view];
}

function DetailView({ view, me, userEmail, onDone }: { view: View; me: ReturnType<typeof useCurrentProfile>["data"]; userEmail: string; onDone: () => void }) {
  if (!me) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (view === "account") return <AccountDetail me={me} userEmail={userEmail} onDone={onDone} />;
  if (view === "privacy") return <PreferenceDetail me={me} fields={[{ key: "show_metrics_publicly", label: "Show metrics publicly", description: "Let others see follower, like and view counts." }, { key: "hide_public_counts", label: "Hide like and share counts", description: "Hide public counts while you browse Lumina." }]} />;
  if (view === "messages") return <PreferenceDetail me={me} fields={[{ key: "message_notifications", label: "Message notifications", description: "Notify you when someone sends a message." }]} />;
  if (view === "content") return <ContentDetail me={me} />;
  if (view === "appearance") return <AppearanceDetail />;
  if (view === "close-friends") return <CloseFriendsDetail userId={me.id} />;
  if (view === "blocked") return <BlockedDetail userId={me.id} />;
  if (view === "activity") return <ActivityDetail userId={me.id} />;
  if (view === "orders") return <OrdersDetail userId={me.id} />;
  if (view === "accessibility") return <LocalToggleDetail storageKey="lumina-reduce-motion" label="Reduce motion" description="Minimize interface animation and movement." />;
  if (view === "media") return <MediaDetail />;
  if (view === "language") return <InfoDetail title="Language" body="Lumina currently uses English. More languages will appear here as they become available." icon={Languages} />;
  if (view === "comments") return <InfoDetail title="Comments, tags and mentions" body="Choose whether comments are available each time you create a post. When comments are off, people can message you privately instead." icon={MessageCircle}><Button asChild className="mt-5 w-full"><Link to="/create">Create a post</Link></Button></InfoDetail>;
  if (view === "privacy-centre") return <InfoDetail title="Your privacy on Lumina" body="Your child-safety details and private messages are protected. Public metrics remain hidden unless you choose to show them, and blocked people cannot message you." icon={Shield} />;
  if (view === "status") return <InfoDetail title="Your account is active" body={me.suspended ? `Your account is suspended${me.suspension_reason ? `: ${me.suspension_reason}` : "."}` : "You can use all available Lumina features. No account restrictions are active."} icon={BadgeCheck} />;
  if (view === "about") return <InfoDetail title="Lumina" body="A photography-first social space for original media, chronological discovery and meaningful connection." icon={Info} />;
  return <InfoDetail title="Help with Lumina" body="Find people through Search, manage conversations in Messages, and use Notifications to review recent activity. For account access issues, send yourself a password reset from Lumina Account." icon={CircleHelp} />;
}

function AccountDetail({ me, userEmail, onDone }: { me: NonNullable<ReturnType<typeof useCurrentProfile>["data"]>; userEmail: string; onDone: () => void }) {
  const qc = useQueryClient(); const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(me.display_name ?? ""); const [bio, setBio] = useState(me.bio ?? ""); const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); const { error } = await supabase.from("profiles").update({ display_name: displayName || null, bio: bio || null }).eq("id", me.id); setSaving(false); if (error) return toast.error(error.message); await qc.invalidateQueries({ queryKey: ["profile"] }); toast.success("Profile updated"); onDone(); }
  async function uploadAvatar(file: File) { const ext = file.name.split(".").pop() || "jpg"; const path = `${me.id}/avatar-${Date.now()}.${ext}`; const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type }); if (error) return toast.error(error.message); await supabase.from("profiles").update({ avatar_url: path }).eq("id", me.id); await qc.invalidateQueries({ queryKey: ["profile"] }); toast.success("Photo updated"); }
  async function resetPassword() { if (!userEmail) return toast.error("No email is linked to this account"); const { error } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: `${window.location.origin}/reset-password` }); error ? toast.error(error.message) : toast.success("Password reset email sent"); }
  async function signOut() { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }
  return <div className="space-y-7 p-5 md:p-7"><div className="flex items-center gap-4"><AvatarImage path={me.avatar_url} name={me.display_name ?? me.username} size={76} /><label className="cursor-pointer text-sm font-semibold text-primary">Change profile photo<input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); }} /></label></div><div className="space-y-4"><div><Label>Display name</Label><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} /></div><div><Label>Bio</Label><Textarea rows={4} value={bio} onChange={(event) => setBio(event.target.value)} maxLength={300} /></div><div><Label>Email</Label><Input value={userEmail} disabled /></div><Button className="w-full" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save personal details"}</Button></div><div className="border-t border-border pt-5 space-y-3"><Button variant="outline" className="w-full" onClick={resetPassword}>Send password reset email</Button><Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={signOut}>Sign out</Button></div></div>;
}

type BooleanProfileKey = "show_metrics_publicly" | "hide_public_counts" | "message_notifications" | "hide_reels";
function PreferenceDetail({ me, fields }: { me: NonNullable<ReturnType<typeof useCurrentProfile>["data"]>; fields: { key: BooleanProfileKey; label: string; description: string }[] }) {
  const qc = useQueryClient();
  async function update(key: BooleanProfileKey, value: boolean) { const { error } = await supabase.from("profiles").update({ [key]: value }).eq("id", me.id); if (error) return toast.error(error.message); await qc.invalidateQueries({ queryKey: ["profile"] }); toast.success("Setting updated"); }
  return <div className="divide-y divide-border px-5">{fields.map((field) => <div key={field.key} className="flex items-center gap-4 py-5"><div className="flex-1"><p className="font-medium">{field.label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{field.description}</p></div><Switch checked={Boolean(me[field.key])} onCheckedChange={(value) => void update(field.key, value)} /></div>)}</div>;
}

function ContentDetail({ me }: { me: NonNullable<ReturnType<typeof useCurrentProfile>["data"]> }) {
  const qc = useQueryClient();
  async function update(values: { hide_reels?: boolean; feed_layout?: string }) { const { error } = await supabase.from("profiles").update(values).eq("id", me.id); if (error) return toast.error(error.message); await qc.invalidateQueries({ queryKey: ["profile"] }); toast.success("Content preferences updated"); }
  return <div className="p-5 space-y-7"><div className="flex items-center gap-4"><div className="flex-1"><p className="font-medium">Hide short-form videos</p><p className="mt-1 text-sm text-muted-foreground">Keep your home feed focused on photos and text.</p></div><Switch checked={me.hide_reels} onCheckedChange={(value) => void update({ hide_reels: value })} /></div><div><p className="mb-3 font-medium">Feed layout</p><div className="grid grid-cols-2 gap-3"><Button variant={me.feed_layout === "comfortable" ? "default" : "outline"} onClick={() => void update({ feed_layout: "comfortable" })}>Comfortable</Button><Button variant={me.feed_layout === "compact" ? "default" : "outline"} onClick={() => void update({ feed_layout: "compact" })}>Compact</Button></div></div></div>;
}

function AppearanceDetail() { const { theme, toggle } = useTheme(); return <div className="p-5"><div className="grid grid-cols-2 gap-3"><Button variant={theme === "light" ? "default" : "outline"} onClick={() => theme !== "light" && toggle()}><Sun /> Light</Button><Button variant={theme === "dark" ? "default" : "outline"} onClick={() => theme !== "dark" && toggle()}><Moon /> Dark</Button></div></div>; }

function CloseFriendsDetail({ userId }: { userId: string }) { const { data = [], isLoading } = useQuery({ queryKey: ["settings-close-friends-list", userId], queryFn: async () => { const { data: follows, error } = await supabase.from("follows").select("following_id").eq("follower_id", userId).eq("tier", "close_friend"); if (error) throw error; const ids = (follows ?? []).map((row) => row.following_id); if (!ids.length) return []; const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids); return profiles ?? []; } }); return <PeopleList loading={isLoading} empty="No one is in your Close Friends list yet." people={data} />; }
function BlockedDetail({ userId }: { userId: string }) { const qc = useQueryClient(); const { data = [], isLoading } = useQuery({ queryKey: ["settings-blocked-list", userId], queryFn: async () => { const { data: rows, error } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", userId); if (error) throw error; const ids = (rows ?? []).map((row) => row.blocked_id); if (!ids.length) return []; const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids); return profiles ?? []; } }); async function unblock(id: string) { const { error } = await supabase.from("blocked_users").delete().eq("blocker_id", userId).eq("blocked_id", id); if (error) return toast.error(error.message); await qc.invalidateQueries({ queryKey: ["settings-blocked"] }); toast.success("Account unblocked"); } return <PeopleList loading={isLoading} empty="You haven't blocked anyone." people={data} action={(person) => <Button size="sm" variant="outline" onClick={() => void unblock(person.id)}>Unblock</Button>} />; }
function PeopleList({ people, loading, empty, action }: { people: { id: string; username: string; display_name: string | null; avatar_url: string | null }[]; loading: boolean; empty: string; action?: (person: { id: string; username: string; display_name: string | null; avatar_url: string | null }) => React.ReactNode }) { if (loading) return <div className="p-5 text-sm text-muted-foreground">Loading…</div>; if (!people.length) return <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>; return <div className="divide-y divide-border">{people.map((person) => <div key={person.id} className="flex items-center gap-3 p-4"><AvatarImage path={person.avatar_url} name={person.display_name ?? person.username} size={46} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{person.display_name || person.username}</p><p className="truncate text-sm text-muted-foreground">@{person.username}</p></div>{action?.(person)}</div>)}</div>; }

function ActivityDetail({ userId }: { userId: string }) { const { data, isLoading } = useQuery({ queryKey: ["settings-activity", userId], queryFn: async () => { const [posts, likes, comments] = await Promise.all([supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId), supabase.from("likes").select("post_id", { count: "exact", head: true }).eq("user_id", userId), supabase.from("comments").select("id", { count: "exact", head: true }).eq("user_id", userId)]); return { posts: posts.count ?? 0, likes: likes.count ?? 0, comments: comments.count ?? 0 }; } }); if (isLoading || !data) return <div className="p-5 text-sm text-muted-foreground">Loading…</div>; return <div className="grid grid-cols-3 divide-x divide-border p-6 text-center"><Stat label="Posts" value={data.posts} /><Stat label="Likes" value={data.likes} /><Stat label="Comments" value={data.comments} /></div>; }
function Stat({ label, value }: { label: string; value: number }) { return <div><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>; }

function OrdersDetail({ userId }: { userId: string }) { const { data = [], isLoading } = useQuery({ queryKey: ["settings-orders", userId], queryFn: async () => { const { data, error } = await supabase.from("orders").select("id, amount_cents, currency, status, created_at").or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).order("created_at", { ascending: false }); if (error) throw error; return data ?? []; } }); if (isLoading) return <div className="p-5 text-sm text-muted-foreground">Loading…</div>; if (!data.length) return <div className="p-8 text-center text-sm text-muted-foreground">No Lumina Marketplace orders yet.</div>; return <div className="divide-y divide-border">{data.map((order) => <div key={order.id} className="flex items-center gap-3 p-5"><ShoppingBag className="h-6 w-6"/><div className="flex-1"><p className="font-medium">{order.currency} {(order.amount_cents / 100).toLocaleString()}</p><p className="text-sm capitalize text-muted-foreground">{order.status} · {new Date(order.created_at).toLocaleDateString()}</p></div></div>)}</div>; }

function LocalToggleDetail({ storageKey, label, description }: { storageKey: string; label: string; description: string }) { const [enabled, setEnabled] = useState(false); useEffect(() => setEnabled(window.localStorage.getItem(storageKey) === "true"), [storageKey]); function change(value: boolean) { setEnabled(value); window.localStorage.setItem(storageKey, String(value)); document.documentElement.classList.toggle("reduce-motion", value); toast.success("Accessibility setting updated"); } return <div className="flex items-center gap-4 p-5"><div className="flex-1"><p className="font-medium">{label}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><Switch checked={enabled} onCheckedChange={change} /></div>; }
function MediaDetail() { const [quality, setQuality] = useState(() => typeof window !== "undefined" ? window.localStorage.getItem("lumina-media-quality") ?? "high" : "high"); function choose(value: string) { setQuality(value); window.localStorage.setItem("lumina-media-quality", value); toast.success("Media quality updated"); } return <div className="p-5 space-y-7"><div><p className="font-medium">Media quality</p><p className="mt-1 text-sm text-muted-foreground">High quality preserves original photography. Data saver uses less mobile data.</p><div className="mt-4 grid grid-cols-2 gap-3"><Button variant={quality === "high" ? "default" : "outline"} onClick={() => choose("high")}>High quality</Button><Button variant={quality === "data" ? "default" : "outline"} onClick={() => choose("data")}>Data saver</Button></div></div><div className="border-t border-border pt-5"><p className="font-medium">Device permissions</p><p className="mt-1 text-sm text-muted-foreground">Lumina asks for camera, microphone or photo access only when you choose a related action.</p></div><div className="border-t border-border pt-5"><p className="font-medium">Downloads</p><p className="mt-1 text-sm text-muted-foreground">Use the download control on a reel or open original media to save it.</p></div></div>; }
function InfoDetail({ title, body, icon: Icon, children }: { title: string; body: string; icon: Icon; children?: React.ReactNode }) { return <div className="p-7 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted"><Icon className="h-8 w-8" /></span><h2 className="mt-5 font-sans text-xl font-bold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>{children}</div>; }
