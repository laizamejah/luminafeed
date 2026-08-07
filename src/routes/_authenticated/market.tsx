import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { useMySellerStatus } from "@/hooks/use-verified-seller";
import { SellerApplyDialog } from "@/components/seller-apply-dialog";
import { VerifiedSellerBadge } from "@/components/verified-seller-badge";
import { formatPrice } from "@/lib/commission";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Menu, MapPin, Tag, Sparkles, Compass, LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/_authenticated/market")({
  component: MarketLayout,
});

interface Listing {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  cover_path: string | null;
  category: string | null;
  location_name: string | null;
  seller_id: string;
  seller: { username: string; display_name: string | null };
}

function MarketLayout() {
  const matches = useMatches();
  const isChild = matches.some((m) => m.routeId !== "/_authenticated/market");
  if (isChild) return <Outlet />;
  return <MarketIndex />;
}

type Pill = "sell" | "for_you" | "local" | "categories";

const RADII = [5, 10, 25, 50, 100];

function MarketIndex() {
  const nav = useNavigate();
  const { data: application, isVerified, userId } = useMySellerStatus();
  const [applyOpen, setApplyOpen] = useState(false);
  const [pill, setPill] = useState<Pill>("for_you");
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [city, setCity] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("lumina.market.city")) || "Nairobi");
  const [radius, setRadius] = useState(() => Number((typeof localStorage !== "undefined" && localStorage.getItem("lumina.market.radius")) || 25));
  const [locOpen, setLocOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);

  const { data: listings, isLoading } = useQuery({
    queryKey: ["listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(`id, title, price_cents, currency, cover_path, category, location_name, seller_id,
          seller:profiles!listings_seller_id_fkey (username, display_name)`)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as unknown as Listing[];
    },
  });

  const { data: verifiedIds = [] } = useQuery({
    queryKey: ["verified-seller-ids"],
    queryFn: async () => {
      const { data } = await supabase.from("verified_sellers").select("user_id").eq("status", "approved");
      return (data ?? []).map((r) => r.user_id as string);
    },
  });

  const categories = useMemo(
    () => [...new Set((listings ?? []).map((l) => l.category).filter(Boolean) as string[])],
    [listings],
  );

  const visible = (listings ?? []).filter((l) => {
    if (q && !`${l.title} ${l.category ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (category && l.category !== category) return false;
    if (pill === "local" && city) return (l.location_name ?? "").toLowerCase().includes(city.toLowerCase());
    return true;
  });

  function onSell() {
    if (isVerified) nav({ to: "/market/new" });
    else setApplyOpen(true);
  }

  function saveLocation() {
    localStorage.setItem("lumina.market.city", city);
    localStorage.setItem("lumina.market.radius", String(radius));
    setLocOpen(false);
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <header className="liquid-glass sticky top-0 z-30 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="font-serif text-2xl">Marketplace</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setSearchOpen((v) => !v)} aria-label="Search marketplace" className="grid h-9 w-9 place-items-center rounded-full bg-secondary/70">
              <Search className="h-4 w-4" />
            </button>
            <button onClick={() => setPill("categories")} aria-label="Marketplace menu" className="grid h-9 w-9 place-items-center rounded-full bg-secondary/70">
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="mx-auto mt-2 max-w-5xl">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Marketplace" className="rounded-full" />
          </div>
        )}

        {/* Sub-nav pills */}
        <div className="mx-auto mt-2 flex max-w-5xl items-center gap-2 overflow-x-auto scrollbar-none">
          {([
            ["sell", "Sell", Tag],
            ["for_you", "For you", Sparkles],
            ["local", "Local", Compass],
            ["categories", "Categories", LayoutGrid],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => (key === "sell" ? onSell() : (setPill(key), setCategory(null)))}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                pill === key && key !== "sell" ? "bg-foreground text-background" : "bg-secondary/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
          <button
            onClick={() => setLocOpen(true)}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary/70 px-3.5 py-1.5 text-sm"
          >
            <MapPin className="h-3.5 w-3.5" /> {city} · {radius}km
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4">
        {pill === "categories" && (
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(category === c ? null : c)}
                className={`rounded-full px-3 py-1.5 text-sm ${category === c ? "bg-foreground text-background" : "bg-secondary/70"}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {isLoading && <p className="mt-10 text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && visible.length === 0 && (
          <div className="mt-16 text-center">
            <p className="font-serif text-xl">Nothing here yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">Try another filter, or list something of your own.</p>
          </div>
        )}

        {/* 2-column product grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((l) => (
            <ListingCard key={l.id} l={l} verified={verifiedIds.includes(l.seller_id)} />
          ))}
        </div>
      </div>

      {locOpen && (
        <Dialog open onOpenChange={(o) => !o && setLocOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Location</DialogTitle></DialogHeader>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Radius</p>
              <div className="flex flex-wrap gap-2">
                {RADII.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={`rounded-full px-3 py-1.5 text-sm ${radius === r ? "bg-foreground text-background" : "bg-secondary/70"}`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>
            <button onClick={saveLocation} className="mt-2 w-full rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Apply</button>
          </DialogContent>
        </Dialog>
      )}

      {applyOpen && userId && (
        <SellerApplyDialog userId={userId} existing={application ?? null} onClose={() => setApplyOpen(false)} />
      )}
    </div>
  );
}

function ListingCard({ l, verified }: { l: Listing; verified: boolean }) {
  const { data: url } = useSignedUrl("media", l.cover_path);
  return (
    <Link to="/market/$listingId" params={{ listingId: l.id }} className="group">
      <div className="aspect-square overflow-hidden rounded-xl bg-muted">
        {url ? <img src={url} alt={l.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : null}
      </div>
      <div className="mt-1.5">
        <div className="text-sm font-semibold tabular-nums">{formatPrice(l.price_cents, l.currency)}</div>
        <div className="line-clamp-1 text-sm">{l.title}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{l.location_name || `@${l.seller.username}`}</span>
          <VerifiedSellerBadge verified={verified} compact />
        </div>
      </div>
    </Link>
  );
}
