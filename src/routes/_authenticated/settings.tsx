import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentProfile } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AvatarImage } from "@/components/avatar-image";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: me } = useCurrentProfile();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [showMetrics, setShowMetrics] = useState(false);
  const [hideReels, setHideReels] = useState(false);
  const [msgNotif, setMsgNotif] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) {
      setDisplayName(me.display_name ?? "");
      setBio(me.bio ?? "");
      setShowMetrics(me.show_metrics_publicly);
      setHideReels(me.hide_reels);
      setMsgNotif(me.message_notifications ?? true);
    }
  }, [me]);

  if (!me) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({
        display_name: displayName || null,
        bio: bio || null,
        show_metrics_publicly: showMetrics,
        hide_reels: hideReels,
        message_notifications: msgNotif,
      }).eq("id", me!.id);
      if (error) throw error;
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${me!.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) return toast.error(error.message);
    await supabase.from("profiles").update({ avatar_url: path }).eq("id", me!.id);
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Avatar updated");
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12 space-y-10">
      <div>
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">@{me.username}</p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <AvatarImage path={me.avatar_url} name={me.display_name ?? me.username} size={72} />
          <label className="cursor-pointer text-sm underline underline-offset-4">
            Change photo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
          </label>
        </div>

        <div><Label>Display name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} /></div>
        <div><Label>Bio</Label><Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} /></div>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-xl">Notifications & privacy</h2>
        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">Message notifications</div>
            <div className="text-xs text-muted-foreground">Get notified when someone messages you.</div>
          </div>
          <Switch checked={msgNotif} onCheckedChange={setMsgNotif} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">Show metrics publicly</div>
            <div className="text-xs text-muted-foreground">Off by default. Others only see counts when this is on.</div>
          </div>
          <Switch checked={showMetrics} onCheckedChange={setShowMetrics} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">Hide short-form videos from feed</div>
            <div className="text-xs text-muted-foreground">A pure, static photo feed.</div>
          </div>
          <Switch checked={hideReels} onCheckedChange={setHideReels} />
        </div>
      </section>

      <div className="flex gap-3">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}
