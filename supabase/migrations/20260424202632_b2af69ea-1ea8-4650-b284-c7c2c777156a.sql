DO $$
DECLARE
  v_owner uuid;
  v_rest  uuid;
  v_cat_mains uuid;
  v_cat_starters uuid;
  v_cat_south uuid;
  v_cat_desserts uuid;
  v_cat_drinks uuid;
BEGIN
  -- Skip if the demo already exists
  IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug = 'spice-junction') THEN
    RAISE NOTICE 'spice-junction already exists, skipping seed';
    RETURN;
  END IF;

  -- Pick the earliest signed-up user as the demo owner
  SELECT id INTO v_owner FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'No auth.users found — sign up at least one user before seeding demo data.';
  END IF;

  -- Make sure the owner has the merchant role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_owner, 'merchant'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.restaurants (owner_id, name, slug, tagline, description, address, city, gst_percentage, container_charge, is_active)
  VALUES (
    v_owner,
    'Spice Junction',
    'spice-junction',
    'Bold flavours. Honest prices. Fresh every day.',
    'A modern Indian kitchen serving handcrafted biryanis, tandoor specials and South Indian classics.',
    '12, MG Road, Indiranagar',
    'Bengaluru',
    5.00,
    10.00,
    true
  )
  RETURNING id INTO v_rest;

  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (v_rest, 'Starters', 1) RETURNING id INTO v_cat_starters;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (v_rest, 'Mains', 2) RETURNING id INTO v_cat_mains;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (v_rest, 'South Indian', 3) RETURNING id INTO v_cat_south;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (v_rest, 'Desserts', 4) RETURNING id INTO v_cat_desserts;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (v_rest, 'Drinks', 5) RETURNING id INTO v_cat_drinks;

  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, diet, prep_time_minutes, image_url, is_featured, sort_order) VALUES
    (v_rest, v_cat_starters, 'Tandoori Chicken (Half)', 'Smoky, marinated overnight in yogurt and spices, charred in the tandoor.', 220, 'non_veg', 18, 'dish-tandoori.jpg', true, 1),
    (v_rest, v_cat_starters, 'Paneer Tikka', 'Cubes of cottage cheese, bell peppers and onions, char-grilled.', 180, 'veg', 15, 'dish-paneer.jpg', false, 2),

    (v_rest, v_cat_mains, 'Chicken Biryani', 'Long-grain basmati, layered with spiced chicken, saffron and fried onions.', 260, 'non_veg', 22, 'dish-biryani.jpg', true, 1),
    (v_rest, v_cat_mains, 'Veg Biryani', 'Aromatic basmati with vegetables, mint and warm spices.', 200, 'veg', 20, 'dish-biryani.jpg', false, 2),
    (v_rest, v_cat_mains, 'Chole Bhature', 'Punjabi spiced chickpeas with two fluffy bhature.', 150, 'veg', 12, 'dish-chole.jpg', false, 3),
    (v_rest, v_cat_mains, 'Paneer Butter Masala', 'Silky tomato-cashew gravy with soft paneer cubes. Served with butter naan.', 220, 'veg', 15, 'dish-paneer.jpg', true, 4),

    (v_rest, v_cat_south, 'Masala Dosa', 'Crisp rice crepe with spiced potato filling, sambhar and chutneys.', 130, 'veg', 10, 'dish-dosa.jpg', true, 1),
    (v_rest, v_cat_south, 'Plain Dosa', 'Classic crisp dosa, sambhar and coconut chutney.', 100, 'veg', 8, 'dish-dosa.jpg', false, 2),

    (v_rest, v_cat_desserts, 'Gulab Jamun (2 pcs)', 'Warm milk dumplings soaked in cardamom-rose syrup.', 80, 'veg', 5, 'dish-gulab.jpg', false, 1),

    (v_rest, v_cat_drinks, 'Masala Chai', 'Strong cutting chai with ginger and cardamom.', 40, 'veg', 5, 'dish-chai.jpg', false, 1),
    (v_rest, v_cat_drinks, 'Sweet Lassi', 'Thick yogurt blend, lightly sweetened.', 70, 'veg', 5, 'dish-chai.jpg', false, 2);
END $$;