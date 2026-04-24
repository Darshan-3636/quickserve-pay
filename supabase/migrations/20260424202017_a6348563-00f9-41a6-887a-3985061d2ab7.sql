-- Secure self-service upgrade to merchant role.
-- Users can only grant 'merchant' to THEMSELVES via this function.
-- They still cannot insert arbitrary roles or assign roles to other users.
CREATE OR REPLACE FUNCTION public.claim_merchant_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'merchant'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_merchant_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_merchant_role() TO authenticated;