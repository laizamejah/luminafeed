import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { AvatarImage } from "@/components/avatar-image";
import { Send, MapPin } from "lucide-react";
import { useState } from "react";

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

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(`id, title, description, price_cents, currency, condition, category, location_name, status, seller_id,
          seller:profiles!listings_seller_id_fkey (id, username, display_name, avatar_url),
          images:listing_media (storage_path, position)`)
        .eq("id", listingId).single();
      if (error) throw error;
      return data as unknown as ListingFull;
    },
  });

  if (isLoading || !listing) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const images = [...listing.images].sort((a, b) => a.position - b.position);
  const isOwn = user?.id === listing.seller_id;

  async function messageSeller() {
    if (!user || !listing) return;
    setSending(true);
    const content = `Hi! I'm interested in your listing: "${listing.title}" (${formatPrice(listing.price_cents, listing.currency)}).`;
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id, recipient_id: listing.seller_id, content,
    });
    setSending(false);
    if (error) return;
    nav({ to: "/messages/$userId", params: { userId: listing.seller_id } });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 grid md:grid-cols-2 gap-8">
      <div className="space-y-3">
        {images.map((im) => <ListingImage key={im.storage_path} path={im.storage_path} />)}
      </div>
      <div>
        <h1 className="font-serif text-3xl">{listing.title}</h1>
        <div className="mt-2 text-2xl tabular-nums">{formatPrice(listing.price_cents, listing.currency)}</div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5 capitalize">{listing.condition.replace("_", " ")}</span>
          {listing.category && <span className="rounded-full border border-border px-2 py-0.5">{listing.category}</span>}
          {listing.location_name && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{listing.location_name}</span>}
        </div>

        <Link to="/u/$username" params={{ username: listing.seller.username }} className="mt-6 flex items-center gap-3">
          <AvatarImage path={listing.seller.avatar_url} name={listing.seller.display_name ?? listing.seller.username} size={40} />
          <div className="text-sm">
            <div className="font-medium">{listing.seller.display_name || listing.seller.username}</div>
            <div className="text-muted-foreground">@{listing.seller.username}</div>
          </div>
        </Link>

        {listing.description && <p className="mt-6 whitespace-pre-wrap text-sm">{listing.description}</p>}

        {!isOwn && (
          <Button onClick={messageSeller} disabled={sending} size="lg" className="mt-8 w-full">
            <Send className="h-4 w-4" />{sending ? "Sending…" : "Message seller"}
          </Button>
        )}
        {isOwn && listing.status === "active" && (
          <Button
            variant="outline" className="mt-8 w-full"
            onClick={async () => { await supabase.from("listings").update({ status: "sold" }).eq("id", listing.id); nav({ to: "/market" }); }}
          >Mark as sold</Button>
        )}
      </div>
    </div>
  );
}

function ListingImage({ path }: { path: string }) {
  const { data: url } = useSignedUrl("media", path);
  return <div className="w-full overflow-hidden rounded-md bg-muted">{url && <img src={url} alt="" className="w-full h-auto object-contain" />}</div>;
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}
