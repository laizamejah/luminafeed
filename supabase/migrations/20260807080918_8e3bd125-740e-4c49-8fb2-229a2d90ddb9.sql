-- 1. Verified sellers
CREATE TABLE IF NOT EXISTS public.verified_sellers (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  business_name text NOT NULL,
  contact_phone text,
  contact_email text,
  city text,
  payout_method text NOT NULL DEFAULT 'mpesa',
  mpesa_number text,
  stripe_account_id text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.verified_sellers TO authenticated;
GRANT SELECT ON public.verified_sellers TO anon;
GRANT ALL ON public.verified_sellers TO service_role;

ALTER TABLE public.verified_sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seller status is public" ON public.verified_sellers
  FOR SELECT USING (true);
CREATE POLICY "Users apply for themselves" ON public.verified_sellers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Users update own application" ON public.verified_sellers
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage seller applications" ON public.verified_sellers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER verified_sellers_touch BEFORE UPDATE ON public.verified_sellers
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_verified_seller(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.verified_sellers WHERE user_id = _user_id AND status = 'approved')
$$;

-- 2. Listing contact + geo fields
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- 3. Only verified sellers may list
DROP POLICY IF EXISTS "Users insert own listings" ON public.listings;
CREATE POLICY "Verified sellers insert own listings" ON public.listings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id AND public.is_verified_seller(auth.uid()));

-- 4. Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  seller_net_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'KES',
  provider text NOT NULL DEFAULT 'mpesa',
  provider_ref text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyer and seller read own orders" ON public.orders
  FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Buyers create own orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);

CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();