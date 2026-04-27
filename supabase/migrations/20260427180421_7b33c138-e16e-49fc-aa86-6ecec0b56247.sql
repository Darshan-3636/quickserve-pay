
-- Best-seller stats view: aggregates sales per restaurant.
CREATE OR REPLACE VIEW public.restaurant_stats
WITH (security_invoker=on) AS
SELECT
  r.id AS restaurant_id,
  COALESCE(SUM(oi.quantity), 0)::int AS total_units_sold,
  COUNT(DISTINCT o.id) FILTER (WHERE o.payment_status = 'success')::int AS orders_count,
  COALESCE(AVG(mi.price), 0)::numeric(10,2) AS avg_price,
  COALESCE(MIN(mi.price), 0)::numeric(10,2) AS min_price,
  COALESCE(MAX(mi.price), 0)::numeric(10,2) AS max_price
FROM public.restaurants r
LEFT JOIN public.menu_items mi ON mi.restaurant_id = r.id
LEFT JOIN public.orders o
  ON o.restaurant_id = r.id AND o.payment_status = 'success'
LEFT JOIN public.order_items oi
  ON oi.order_id = o.id
GROUP BY r.id;

GRANT SELECT ON public.restaurant_stats TO anon, authenticated;

-- Storage policies for menu item images stored under menu/<restaurant_id>/...
CREATE POLICY "Restaurant owners upload menu images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-assets'
  AND (storage.foldername(name))[1] = 'menu'
  AND EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id::text = (storage.foldername(name))[2]
      AND r.owner_id = auth.uid()
  )
);

CREATE POLICY "Restaurant owners update menu images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND (storage.foldername(name))[1] = 'menu'
  AND EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id::text = (storage.foldername(name))[2]
      AND r.owner_id = auth.uid()
  )
);

CREATE POLICY "Restaurant owners delete menu images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND (storage.foldername(name))[1] = 'menu'
  AND EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id::text = (storage.foldername(name))[2]
      AND r.owner_id = auth.uid()
  )
);

-- Public can view menu images (already public bucket but make explicit)
CREATE POLICY "Anyone can view menu images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'restaurant-assets'
);

-- Track PhonePe order id separately for clarity (re-use phonepe_transaction_id field too)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS phonepe_order_id text;
