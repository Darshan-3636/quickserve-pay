import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SeedSchema = z.object({
  ownerId: z.string().uuid().optional(),
});

const DEMO_SLUG = "spice-junction";

/**
 * Seeds a demo restaurant + menu if it doesn't already exist.
 * Idempotent: safe to call repeatedly.
 */
export const seedDemoRestaurant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SeedSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("slug", DEMO_SLUG)
      .maybeSingle();

    if (existing) {
      return { ok: true as const, restaurantId: existing.id, created: false };
    }

    // Need an owner. If none provided, create a placeholder service-account user via admin API.
    let ownerId = data.ownerId;
    if (!ownerId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: `demo-owner-${Date.now()}@quickserve.local`,
        password: crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { display_name: "Spice Junction Owner" },
      });
      if (createErr || !created.user) {
        return { ok: false as const, error: createErr?.message ?? "Could not create owner" };
      }
      ownerId = created.user.id;
      await supabaseAdmin.from("user_roles").insert({ user_id: ownerId, role: "merchant" }).select();
    }

    const { data: restaurant, error: rErr } = await supabaseAdmin
      .from("restaurants")
      .insert({
        owner_id: ownerId,
        name: "Spice Junction",
        slug: DEMO_SLUG,
        tagline: "Royal Indian flavours, ready in minutes",
        description:
          "From slow-cooked Hyderabadi biryani to crispy South Indian dosas — pre-paid, packed, and waiting for you.",
        cover_image_url: "/src/assets/hero-thali.jpg",
        address: "MG Road, Bengaluru",
        city: "Bengaluru",
        gst_percentage: 5.0,
        container_charge: 15.0,
        is_active: true,
      })
      .select()
      .single();

    if (rErr || !restaurant) {
      return { ok: false as const, error: rErr?.message ?? "Could not create restaurant" };
    }

    const cats = [
      { name: "Biryanis & Rice", sort_order: 1 },
      { name: "North Indian Curries", sort_order: 2 },
      { name: "South Indian", sort_order: 3 },
      { name: "Tandoori", sort_order: 4 },
      { name: "Sweets", sort_order: 5 },
      { name: "Beverages", sort_order: 6 },
    ];
    const { data: categories } = await supabaseAdmin
      .from("menu_categories")
      .insert(cats.map((c) => ({ ...c, restaurant_id: restaurant.id })))
      .select();

    const catId = (name: string) => categories?.find((c) => c.name === name)?.id;

    const items = [
      {
        name: "Hyderabadi Chicken Biryani",
        description: "Aromatic basmati layered with marinated chicken, saffron and fried onions.",
        price: 320,
        image_url: "/src/assets/dish-biryani.jpg",
        diet: "non_veg" as const,
        prep_time_minutes: 18,
        is_featured: true,
        category_id: catId("Biryanis & Rice"),
        sort_order: 1,
      },
      {
        name: "Veg Dum Biryani",
        description: "Slow-cooked vegetables, basmati rice, mint and saffron.",
        price: 260,
        image_url: "/src/assets/dish-biryani.jpg",
        diet: "veg" as const,
        prep_time_minutes: 16,
        category_id: catId("Biryanis & Rice"),
        sort_order: 2,
      },
      {
        name: "Paneer Butter Masala",
        description: "Soft paneer cubes in a creamy tomato gravy. Served with butter naan.",
        price: 280,
        image_url: "/src/assets/dish-paneer.jpg",
        diet: "veg" as const,
        prep_time_minutes: 14,
        is_featured: true,
        category_id: catId("North Indian Curries"),
        sort_order: 1,
      },
      {
        name: "Chole Bhature",
        description: "Fluffy bhature with spicy chickpea curry and pickled onions.",
        price: 180,
        image_url: "/src/assets/dish-chole.jpg",
        diet: "veg" as const,
        prep_time_minutes: 12,
        category_id: catId("North Indian Curries"),
        sort_order: 2,
      },
      {
        name: "Masala Dosa",
        description: "Crispy fermented crepe with spiced potato, sambar and chutneys.",
        price: 140,
        image_url: "/src/assets/dish-dosa.jpg",
        diet: "veg" as const,
        prep_time_minutes: 10,
        is_featured: true,
        category_id: catId("South Indian"),
        sort_order: 1,
      },
      {
        name: "Tandoori Chicken (Half)",
        description: "Charcoal-grilled chicken marinated in yogurt and spices.",
        price: 290,
        image_url: "/src/assets/dish-tandoori.jpg",
        diet: "non_veg" as const,
        prep_time_minutes: 22,
        is_featured: true,
        category_id: catId("Tandoori"),
        sort_order: 1,
      },
      {
        name: "Gulab Jamun (2 pc)",
        description: "Warm milk dumplings soaked in cardamom syrup.",
        price: 80,
        image_url: "/src/assets/dish-gulab.jpg",
        diet: "veg" as const,
        prep_time_minutes: 4,
        category_id: catId("Sweets"),
        sort_order: 1,
      },
      {
        name: "Masala Chai",
        description: "Brewed with ginger, cardamom and cinnamon. Served in a kulhad.",
        price: 40,
        image_url: "/src/assets/dish-chai.jpg",
        diet: "veg" as const,
        prep_time_minutes: 5,
        category_id: catId("Beverages"),
        sort_order: 1,
      },
    ];

    await supabaseAdmin
      .from("menu_items")
      .insert(items.map((it) => ({ ...it, restaurant_id: restaurant.id })));

    return { ok: true as const, restaurantId: restaurant.id, created: true };
  });
