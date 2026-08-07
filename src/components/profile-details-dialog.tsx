import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";

export interface ProfileDetails {
  location: string | null;
  hometown: string | null;
  relationship_status: string | null;
  education: string | null;
  category: string | null;
  bio: string | null;
}

const FIELDS: { key: keyof ProfileDetails; label: string; placeholder: string }[] = [
  { key: "bio", label: "Bio", placeholder: "A short description" },
  { key: "category", label: "Category", placeholder: "Digital creator" },
  { key: "location", label: "Lives in", placeholder: "Nairobi, Kenya" },
  { key: "hometown", label: "From", placeholder: "Home town" },
  { key: "relationship_status", label: "Relationship", placeholder: "Single" },
  { key: "education", label: "Education", placeholder: "Studied at …" },
];

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

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("profiles").update(form).eq("id", userId);
    setBusy(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Details updated");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit details</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</span>
              <Input
                className="mt-1"
                value={form[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
