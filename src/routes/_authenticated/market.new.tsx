import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMySellerStatus } from "@/hooks/use-verified-seller";
import { SellerApplyDialog } from "@/components/seller-apply-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/market/new")({
  component: NewListing,
});

function NewListing() {
  const { data: user } = useCurrentUser();
  const { data: application, isVerified, isLoading: loadingSeller } = useMySellerStatus();
  const nav = useNavigate();
  const [applyOpen, setApplyOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [condition, setCondition] = useState("used");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState(application?.city ?? "");
  const [phone, setPhone] = useState(application?.contact_phone ?? "");
  const [email, setEmail] = useState(application?.contact_email ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const priceCents = Math.round(parseFloat(price) * 100);
    if (!title.trim() || !Number.isFinite(priceCents) || priceCents < 0) return toast.error("Title and valid price required");
    if (files.length === 0) return toast.error("Add at least one photo");
    setSubmitting(true);
    try {
      const { data: listing, error } = await supabase.from("listings").insert({
        seller_id: user.id,
        title: title.trim(),
        description: description || null,
        price_cents: priceCents,
        currency,
        condition,
        category: category || null,
        location_name: location || null,
        contact_phone: phone || null,
        contact_email: email || null,
      }).select().single();
      if (error) throw error;

      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop() || "jpg";
        const path = `listings/${user.id}/${listing.id}/${i}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        paths.push(path);
        await supabase.from("listing_media").insert({ listing_id: listing.id, storage_path: path, position: i });
      }
      await supabase.from("listings").update({ cover_path: paths[0] }).eq("id", listing.id);
      toast.success("Listed");
      nav({ to: "/market/$listingId", params: { listingId: listing.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not list");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingSeller) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  if (!isVerified) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-serif text-2xl">Verified sellers only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {application?.status === "pending"
            ? "Your seller application is under review. We'll let you know as soon as it's approved."
            : "Listing on Lumina Marketplace requires Verified Seller status. It only takes a minute to apply."}
        </p>
        <Button className="mt-6 w-full" onClick={() => setApplyOpen(true)}>
          {application ? "Update application" : "Apply for verification"}
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => nav({ to: "/market" })}>Back to Marketplace</Button>
        {applyOpen && user && (
          <SellerApplyDialog userId={user.id} existing={application ?? null} onClose={() => setApplyOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-3xl">List an item</h1>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <div>
          <Label>Photos</Label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-background/90 p-1"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {files.length < 8 && (
              <label className="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-secondary/40">
                + Add
                <input type="file" multiple accept="image/*" className="sr-only" onChange={(e) => e.target.files && setFiles([...files, ...Array.from(e.target.files)].slice(0, 8))} />
              </label>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="t">Product title</Label>
          <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Label htmlFor="p">Price</Label>
            <Input id="p" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="cur">Currency</Label>
            <select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="KES">KES</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cat">Category</Label>
            <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Cameras, Prints…" maxLength={40} />
          </div>
          <div>
            <Label htmlFor="c">Condition</Label>
            <select id="c" value={condition} onChange={(e) => setCondition(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="new">New</option>
              <option value="like_new">Like new</option>
              <option value="used">Used</option>
              <option value="for_parts">For parts</option>
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="loc">Location</Label>
          <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Nairobi" maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ph">Contact phone</Label>
            <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254…" maxLength={30} />
          </div>
          <div>
            <Label htmlFor="em">Contact email</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
          </div>
        </div>
        <div>
          <Label htmlFor="d">Description</Label>
          <Textarea id="d" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
        </div>
        <Button type="submit" disabled={submitting} size="lg" className="w-full">{submitting ? "Listing…" : "Publish listing"}</Button>
      </form>
    </div>
  );
}
