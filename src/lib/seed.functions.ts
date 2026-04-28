import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MERCHANT_EMAIL = "ds3590778@gmail.com";
const MERCHANT_PASSWORD = "123456";
const RESTAURANT_SLUG = "quickserve-kitchen";

/**
 * Idempotent: ensures the single hardcoded merchant account exists,
 * has the merchant role, and owns the single restaurant.
 *
 * Safe to call from anywhere (e.g. on home page mount). Uses service role.
 */
export const ensureMerchantSeed = createServerFn({ method: "POST" })
  .handler(async () => {
    // 1. Find or create the merchant user.
    let userId: string | null = null;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existing = list?.users.find((u) => u.email === MERCHANT_EMAIL);
    if (existing) {
      userId = existing.id;
      // Ensure password matches the documented value (so logins always work).
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: MERCHANT_PASSWORD,
        email_confirm: true,
      });
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: MERCHANT_EMAIL,
        password: MERCHANT_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: "QuickServe Merchant" },
      });
      if (error || !created.user) {
        return { ok: false as const, error: error?.message ?? "create user failed" };
      }
      userId = created.user.id;
    }

    // 2. Ensure merchant role.
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "merchant" }, { onConflict: "user_id,role" });

    // 3. Ensure restaurant exists.
    const { data: rest } = await supabaseAdmin
      .from("restaurants")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();

    let restaurantId = rest?.id ?? null;
    if (!rest) {
      const { data: newRest, error: rErr } = await supabaseAdmin
        .from("restaurants")
        .insert({
          owner_id: userId,
          name: "QuickServe Kitchen",
          slug: RESTAURANT_SLUG,
          tagline: "Hot, fresh & ready in minutes",
          description:
            "Order ahead, pay with PhonePe, walk in with your 4-digit code.",
          cuisine: "Indian",
          city: "Bengaluru",
          gst_percentage: 5,
          container_charge: 0,
          payment_mode: "phonepe",
          is_active: true,
        })
        .select()
        .single();
      if (rErr || !newRest) {
        return { ok: false as const, error: rErr?.message ?? "create restaurant failed" };
      }
      restaurantId = newRest.id;
    }

    return { ok: true as const, userId, restaurantId };
  });
