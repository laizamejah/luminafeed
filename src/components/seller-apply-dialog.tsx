import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import type { SellerApplication } from "@/hooks/use-verified-seller";

/** Prompt shown when a non-verified user taps "Sell". Lets them apply for Verified Seller status. */
export function SellerApplyDialog({
  userId,
  existing,
  onClose,
}: {
  userId: string;
  existing: SellerApplication | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    business_name: existing?.business_name ?? "",
    contact_phone: existing?.contact_phone ?? "",
    contact_email: existing?.contact_email ?? "",
    city: existing?.city ?? "",
    payout_method: existing?.payout_method ?? "mpesa",
    mpesa_number: existing?.mpesa_number ?? "",
  });

  const pending = existing?.status === "pending";
  const rejected = existing?.status === "rejected";

  async function submit() {
    if (!form.business_name.trim()) return toast.error("Business or seller name is required");
    setBusy(true);
    const payload = { ...form, user_id: userId, status: "pending" };
    const { error } = existing
      ? await supabase.from("verified_sellers").update(payload).eq("user_id", userId)
      : await supabase.from("verified_sellers").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["seller-status"] });
    toast.success("Application submitted for review");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Become a verified seller</DialogTitle>
          <DialogDescription>
            {pending
              ? "Your application is under review. You can update your details below."
              : rejected
                ? "Your previous application was declined. Update your details and re-apply."
                : "Only verified sellers can list items on Lumina Marketplace. Tell us a little about you."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Business / seller name</Label>
            <Input className="mt-1" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input className="mt-1" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="+254…" />
            </div>
            <div>
              <Label>City</Label>
              <Input className="mt-1" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Nairobi" />
            </div>
          </div>
          <div>
            <Label>Contact email</Label>
            <Input className="mt-1" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payout method</Label>
              <select
                value={form.payout_method}
                onChange={(e) => setForm({ ...form, payout_method: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="mpesa">M-Pesa</option>
                <option value="stripe">Stripe</option>
              </select>
            </div>
            <div>
              <Label>M-Pesa number</Label>
              <Input className="mt-1" value={form.mpesa_number} onChange={(e) => setForm({ ...form, mpesa_number: e.target.value })} placeholder="2547…" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Not now</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Submitting…" : pending ? "Update application" : "Apply"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
