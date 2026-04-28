-- 1) FIX storage RLS for restaurant-assets bucket
DROP POLICY IF EXISTS "Restaurant owners upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Restaurant owners update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Restaurant owners delete menu images" ON storage.objects;
DROP POLICY IF EXISTS "Owners upload restaurant assets" ON storage.objects;
DROP POLICY IF EXISTS "Owners update restaurant assets" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete restaurant assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view menu images" ON storage.objects;

-- Public read
CREATE POLICY "Public read restaurant-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'restaurant-assets');

-- Authenticated merchants (owners of any restaurant) can write/update/delete
-- under menu/<restaurant_id>/..., logo/<restaurant_id>/..., cover/<restaurant_id>/...
CREATE POLICY "Restaurant owners write restaurant-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND (storage.foldername(name))[1] IN ('menu','logo','cover')
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id::text = (storage.foldername(name))[2]
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Restaurant owners update restaurant-assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND (storage.foldername(name))[1] IN ('menu','logo','cover')
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id::text = (storage.foldername(name))[2]
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Restaurant owners delete restaurant-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND (storage.foldername(name))[1] IN ('menu','logo','cover')
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id::text = (storage.foldername(name))[2]
        AND r.owner_id = auth.uid()
    )
  );

-- 2) ALLOW guest (anonymous) orders
ALTER TABLE public.orders ALTER COLUMN customer_id DROP NOT NULL;

-- Refresh order policies for anon customers
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
CREATE POLICY "Anyone can create orders for themselves"
  ON public.orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    customer_id IS NULL OR customer_id = auth.uid()
  );

DROP POLICY IF EXISTS "Customers see their own orders" ON public.orders;
CREATE POLICY "Customers see their own orders"
  ON public.orders FOR SELECT
  TO anon, authenticated
  USING (
    (customer_id IS NOT NULL AND customer_id = auth.uid())
  );

-- order_items: allow anon insert when their parent order's customer matches
DROP POLICY IF EXISTS "Customers can add items to their orders" ON public.order_items;
CREATE POLICY "Customers add items to their orders"
  ON public.order_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.customer_id IS NULL OR o.customer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Customers see their own order items" ON public.order_items;
CREATE POLICY "Customers see their own order items"
  ON public.order_items FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.customer_id IS NOT NULL
        AND o.customer_id = auth.uid()
    )
  );

-- 3) Unique pickup code per restaurant for ACTIVE orders (avoid collisions for in-flight pickups)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_pickup_code
  ON public.orders (restaurant_id, pickup_code)
  WHERE status IN ('received','preparing','ready','awaiting_verification');

-- 4) RPC to atomically generate a unique 4-digit code for a restaurant
CREATE OR REPLACE FUNCTION public.generate_unique_pickup_code(_restaurant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  LOOP
    candidate := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    PERFORM 1
    FROM public.orders
    WHERE restaurant_id = _restaurant_id
      AND pickup_code = candidate
      AND status IN ('received','preparing','ready','awaiting_verification');
    IF NOT FOUND THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 50 THEN
      -- Fallback: 5-digit if we've somehow exhausted (very unlikely)
      RETURN lpad((floor(random() * 90000) + 10000)::int::text, 5, '0');
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_unique_pickup_code(uuid) TO anon, authenticated, service_role;