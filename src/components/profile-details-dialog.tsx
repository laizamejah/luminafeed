import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { BriefcaseBusiness, GraduationCap, Heart, Link2, MapPin, UserRound, CalendarDays, Phone, Music2 } from "lucide-react";

export interface ProfileDetails {
  location: string | null;
  hometown: string | null;
  relationship_status: string | null;
  education: string | null;
  category: string | null;
  bio: string | null;
  display_name: string | null;
  occupation: string | null;
  work: string | null;
  website: string | null;
  interests: string | null;
}

const GROUPS = [
  { title: "Intro", fields: [{ key: "display_name", label: "Name", icon: UserRound }, { key: "bio", label: "Bio", icon: UserRound }, { key: "category", label: "Category", icon: UserRound }] },
  { title: "Personal details", fields: [{ key: "location", label: "Lives in", icon: MapPin }, { key: "hometown", label: "From", icon: MapPin }, { key: "relationship_status", label: "Relationship", icon: Heart }] },
  { title: "Work & education", fields: [{ key: "occupation", label: "Occupation", icon: BriefcaseBusiness }, { key: "work", label: "Work experience", icon: BriefcaseBusiness }, { key: "education", label: "Education", icon: GraduationCap }] },
  { title: "Links & interests", fields: [{ key: "website", label: "Website", icon: Link2 }, { key: "interests", label: "Interests", icon: Music2 }] },
] as const;

export function ProfileDetailsDialog({
  userId,
  details,
  onClose,
}: {
  userId: string;
  details: ProfileDetails;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ProfileDetails>(details);
  const [busy, setBusy] = useState(false);
  const { data: privateDetails } = useQuery({
    queryKey: ["profile-safety-edit", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profile_safety").select("birth_date, phone, gender").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === "string" ? value.trim() || null : value ?? null]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("profiles").update(payload as any).eq("id", userId);
      if (error) throw error;
      const date = birthDate ?? privateDetails?.birth_date ?? null;
      const { error: privateError } = await supabase.from("profile_safety").upsert({
        id: userId,
        birth_date: date || null,
        birth_year: date ? Number(date.slice(0, 4)) : null,
        phone: (phone ?? privateDetails?.phone ?? "").trim() || null,
        gender: (gender ?? privateDetails?.gender ?? "").trim() || null,
      }, { onConflict: "id" });
      if (privateError) throw privateError;
      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["profile-safety-edit", userId] });
      toast.success("Profile updated");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update profile");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background px-5 py-4 text-left"><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <div className="space-y-7 px-5 py-5">
          {GROUPS.map((group) => <section key={group.title}>
            <h3 className="mb-3 text-lg font-bold">{group.title}</h3>
            <div className="divide-y divide-border">
              {group.fields.map(({ key, label, icon: Icon }) => <label key={key} className="flex items-start gap-3 py-3">
                <Icon className="mt-2 h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1"><span className="mb-1 block text-sm font-medium">{label}</span>
                  {key === "bio" ? <Textarea value={form[key] ?? ""} maxLength={300} rows={3} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} /> :
                    <Input value={form[key] ?? ""} maxLength={key === "website" ? 250 : 120} placeholder={`Add ${label.toLowerCase()}`} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />}
                </span>
              </label>)}
            </div>
          </section>)}
          <section>
            <h3 className="mb-2 text-lg font-bold">Private information</h3>
            <p className="mb-3 text-xs text-muted-foreground">Only you and your guardian, if applicable, can see these details.</p>
            <div className="space-y-3">
              <label className="flex items-center gap-3"><CalendarDays className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1 text-sm">Date of birth<Input className="mt-1" type="date" max={new Date().toISOString().slice(0, 10)} value={birthDate ?? privateDetails?.birth_date ?? ""} onChange={(e) => setBirthDate(e.target.value)} /></span></label>
              <label className="flex items-center gap-3"><UserRound className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1 text-sm">Gender<Input className="mt-1" value={gender ?? privateDetails?.gender ?? ""} onChange={(e) => setGender(e.target.value)} maxLength={80} /></span></label>
              <label className="flex items-center gap-3"><Phone className="h-5 w-5 shrink-0" /><span className="min-w-0 flex-1 text-sm">Phone<Input className="mt-1" type="tel" value={phone ?? privateDetails?.phone ?? ""} onChange={(e) => setPhone(e.target.value)} maxLength={40} /></span></label>
            </div>
          </section>
        </div>
        <DialogFooter>
          <div className="flex w-full justify-end gap-2 border-t border-border bg-background px-5 py-4"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
