-- 1. Add new columns to restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS upi_vpa text,
  ADD COLUMN IF NOT EXISTS payee_name text,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'upi_intent',
  ADD COLUMN IF NOT EXISTS cuisine text;

-- Constrain payment_mode values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurants_payment_mode_check'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_payment_mode_check
      CHECK (payment_mode IN ('upi_intent', 'phonepe_pg', 'razorpay'));
  END IF;
END $$;

-- 2. UPI VPA validation trigger (immutable-safe)
CREATE OR REPLACE FUNCTION public.validate_restaurant_upi_vpa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.upi_vpa IS NOT NULL AND NEW.upi_vpa <> '' THEN
    IF NEW.upi_vpa !~ '^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$' THEN
      RAISE EXCEPTION 'Invalid UPI VPA format. Expected name@handle (e.g. shop@okicici).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_restaurant_upi_vpa ON public.restaurants;
CREATE TRIGGER trg_validate_restaurant_upi_vpa
BEFORE INSERT OR UPDATE OF upi_vpa ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.validate_restaurant_upi_vpa();

-- 3. Add fields to orders for manual UPI verification
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS upi_reference_id text,
  ADD COLUMN IF NOT EXISTS manual_verified_by uuid;

-- 4. Add 'awaiting_verification' to order_status enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'awaiting_verification'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
  ) THEN
    ALTER TYPE public.order_status ADD VALUE 'awaiting_verification' BEFORE 'received';
  END IF;
END $$;

-- 5. Storage bucket for restaurant branding assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-assets', 'restaurant-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "Restaurant assets are publicly viewable" ON storage.objects;
CREATE POLICY "Restaurant assets are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'restaurant-assets');

-- Owner-only write/update/delete (folder = auth.uid())
DROP POLICY IF EXISTS "Owners upload restaurant assets" ON storage.objects;
CREATE POLICY "Owners upload restaurant assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Owners update restaurant assets" ON storage.objects;
CREATE POLICY "Owners update restaurant assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Owners delete restaurant assets" ON storage.objects;
CREATE POLICY "Owners delete restaurant assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);