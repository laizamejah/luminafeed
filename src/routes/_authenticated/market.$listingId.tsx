import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSellerStatus } from "@/hooks/use-verified-seller";
import { VerifiedSellerBadge } from "@/components/verified-seller-badge";
import { splitAmount, formatPrice, PLATFORM_FEE_BPS } from "@/lib/commission";
import { Button } from "@/components/ui/button";
import { AvatarImage } from "@/components/avatar-image";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Send, MapPin, Phone, Mail, ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/market/$listingId")({
  component: ListingDetail,
});

interface ListingFull {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  condition: string;
  category: string | null;
  location_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  seller_id: string;
  seller: { id: string; username: string; display_name: string | null; avatar_url: string | null };
  images: { storage_path: string; position: number }[];
}

function ListingDetail() {
  const { listingId } = Route.useParams();
  const { data: user } = useCurrentUser();
  const nav = useNavigate();
  const [sending, setSending] = useState(false);
  const [idx, setIdx] = useState(0);
  const [checkout, setCheckout] = useState(false);

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(`id, title, description, price_cents, currency, condition, category, location_name,
          contact_phone, contact_email, status, seller_id,
          seller:profiles!listings_seller_id_fkey (id, username, display_name, avatar_url),
          images:listing_media (storage_path, position)`)
        .eq("id", listingId).single();
      if (error) throw error;
      return data as unknown as ListingFull;
    },
  });

  const { data: sellerStatus } = useSellerStatus(listing?.seller_id);

  if (isLoading || !listing) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const images = [...listing.images].sort((a, b) => a.position - b.position);
  const isOwn = user?.id === listing.seller_id;
  const verified = sellerStatus?.status === "approved";

  async function messageSeller() {
    if (!user || !listing) return;
    setSending(true);
    const content = `Hi! I'm interested in your listing: "${listing.title}" (${formatPrice(listing.price_cents, listing.currency)}).`;
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, recipient_id: listing.seller_id, content });
    setSending(false);
    if (error) return toast.error(error.message);
    nav({ to: "/messages/$userId", params: { userId: listing.seller_id } });
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-4 py-8 pb-24 md:grid-cols-2">
      {/* Carousel */}
      <div className="relative overflow-hidden rounded-xl bg-muted">
        {images[idx] && <ListingImage path={images[idx].storage_path} />}
        {images.length > 1 && (
          <>
            <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)} aria-label="Previous image" className="liquid-glass absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setIdx((i) => (i + 1) % images.length)} aria-label="Next image" className="liquid-glass absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full"><ChevronRight className="h-4 w-4" /></button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {images.map((_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === idx ? "bg-foreground" : "bg-foreground/30"}`} />)}
            </div>
          </>
        )}
      </div>

      <div>
        <h1 className="font-serif text-3xl">{listing.title}</h1>
        <div className="mt-2 text-2xl tabular-nums">{formatPrice(listing.price_cents, listing.currency)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5 capitalize">{listing.condition.replace("_", " ")}</span>
          {listing.category && <span className="rounded-full border border-border px-2 py-0.5">{listing.category}</span>}
          {listing.location_name && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{listing.location_name}</span>}
          <VerifiedSellerBadge verified={verified} />
        </div>

        <Link to="/u/$username" params={{ username: listing.seller.username }} className="mt-6 flex items-center gap-3">
          <AvatarImage path={listing.seller.avatar_url} name={listing.seller.display_name ?? listing.seller.username} size={40} />
          <div className="text-sm">
            <div className="flex items-center gap-1 font-medium">{listing.seller.display_name || listing.seller.username} <VerifiedSellerBadge verified={verified} compact /></div>
            <div className="text-muted-foreground">@{listing.seller.username}</div>
          </div>
        </Link>

        {(listing.contact_phone || listing.contact_email) && (
          <div className="mt-4 space-y-1 text-sm text-muted-foreground">
            {listing.contact_phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> {listing.contact_phone}</p>}
            {listing.contact_email && <p className="flex items-center gap-2"><Mail className="h-4 w-4" /> {listing.contact_email}</p>}
          </div>
        )}

        {listing.description && <p className="mt-6 whitespace-pre-wrap text-sm">{listing.description}</p>}

        {!isOwn && listing.status === "active" && (
          <div className="mt-8 space-y-2">
            <Button size="lg" className="w-full" onClick={() => setCheckout(true)}>
              <ShoppingBag className="h-4 w-4" /> Buy now
            </Button>
            <Button variant="outline" size="lg" className="w-full" onClick={messageSeller} disabled={sending}>
              <Send className="h-4 w-4" />{sending ? "Sending…" : "Message seller"}
            </Button>
          </div>
        )}
        {isOwn && listing.status === "active" && (
          <Button
            variant="outline" className="mt-8 w-full"
            onClick={async () => { await supabase.from("listings").update({ status: "sold" }).eq("id", listing.id); nav({ to: "/market" }); }}
          >Mark as sold</Button>
        )}
      </div>

      {checkout && user && (
        <CheckoutDialog listing={listing} buyerId={user.id} onClose={() => setCheckout(false)} />
      )}
    </div>
  );
}

function CheckoutDialog({ listing, buyerId, onClose }: { listing: ListingFull; buyerId: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<"mpesa" | "stripe">("mpesa");
  const split = splitAmount(listing.price_cents);

  async function placeOrder() {
    setBusy(true);
    const { error } = await supabase.from("orders").insert({
      listing_id: listing.id,
      buyer_id: buyerId,
      seller_id: listing.seller_id,
      currency: listing.currency,
      provider: method,
      status: "pending",
      ...split,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Order placed — awaiting payment confirmation");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>{listing.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Item total</span><span className="tabular-nums">{formatPrice(split.amount_cents, listing.currency)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Platform fee ({PLATFORM_FEE_BPS / 100}%)</span><span className="tabular-nums">{formatPrice(split.platform_fee_cents, listing.currency)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Seller receives</span><span className="tabular-nums">{formatPrice(split.seller_net_cents, listing.currency)}</span></div>
        </div>
        <div className="mt-2 flex gap-2">
          {(["mpesa", "stripe"] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)} className={`flex-1 rounded-md px-3 py-2 text-sm capitalize ${method === m ? "bg-foreground text-background" : "bg-secondary/70"}`}>
              {m === "mpesa" ? "M-Pesa" : "Card (Stripe)"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          The payment gateway isn’t connected yet, so this records a pending order with the commission split. Once the gateway is live the split payout settles automatically.
        </p>
        <Button className="mt-2 w-full" onClick={placeOrder} disabled={busy}>{busy ? "Placing…" : "Place order"}</Button>
      </DialogContent>
    </Dialog>
  );
}

function ListingImage({ path }: { path: string }) {
  const { data: url } = useSignedUrl("media", path);
  return <div className="w-full bg-muted">{url && <img src={url} alt="" className="h-auto w-full object-contain" />}</div>;
}
