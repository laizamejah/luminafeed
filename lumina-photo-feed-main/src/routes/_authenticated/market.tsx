import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/market")({
  component: MarketLayout,
});

interface Listing {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  cover_path: string | null;
  seller: { username: string; display_name: string | null };
}

function MarketLayout() {
  const matches = useMatches();
  const isChild = matches.some((m) => m.routeId !== "/_authenticated/market");
  if (isChild) return <Outlet />;
  return <MarketIndex />;
}

function MarketIndex() {
  const { data: listings, isLoading } = useQuery({
    queryKey: ["listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(`id, title, price_cents, currency, cover_path,
          seller:profiles!listings_seller_id_fkey (username, display_name)`)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as Listing[];
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl">Marketplace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gear, prints, and other objects from the community.</p>
        </div>
        <Link to="/market/new"><Button><Plus className="h-4 w-4" /> Sell something</Button></Link>
      </div>

      {isLoading && <p className="mt-10 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && listings?.length === 0 && (
        <div className="mt-16 text-center">
          <p className="font-serif text-xl">No listings yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">Be the first — list your spare lens.</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {listings?.map((l) => <ListingCard key={l.id} l={l} />)}
      </div>
    </div>
  );
}

function ListingCard({ l }: { l: Listing }) {
  const { data: url } = useSignedUrl("media", l.cover_path);
  return (
    <Link to="/market/$listingId" params={{ listingId: l.id }} className="group">
      <div className="aspect-square overflow-hidden rounded-md bg-muted">
        {url ? <img src={url} alt={l.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : null}
      </div>
      <div className="mt-2">
        <div className="text-sm font-medium line-clamp-1">{l.title}</div>
        <div className="text-sm text-muted-foreground tabular-nums">{formatPrice(l.price_cents, l.currency)}</div>
        <div className="text-xs text-muted-foreground">@{l.seller.username}</div>
      </div>
    </Link>
  );
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}
