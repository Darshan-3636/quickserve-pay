import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const EMAIL = "ds3590778@gmail.com";
const PASSWORD = "123456";

async function main() {
  // Create or fetch user
  let userId;
  const { data: list } = await sb.auth.admin.listUsers();
  const existing = list.users.find(u => u.email === EMAIL);
  if (existing) {
    userId = existing.id;
    console.log("User exists:", userId);
    // Reset password to ensure it matches
    await sb.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "QuickServe Merchant", phone: "9999999999" }
    });
    if (error) throw error;
    userId = data.user.id;
    console.log("Created user:", userId);
  }

  // Ensure merchant role
  await sb.from("user_roles").upsert({ user_id: userId, role: "merchant" }, { onConflict: "user_id,role" });

  // Ensure restaurant exists
  const { data: rest } = await sb.from("restaurants").select("*").eq("owner_id", userId).maybeSingle();
  if (!rest) {
    const { data: r, error: rErr } = await sb.from("restaurants").insert({
      owner_id: userId,
      name: "QuickServe Kitchen",
      slug: "quickserve-kitchen",
      tagline: "Hot, fresh & ready in minutes",
      description: "The single restaurant powering QuickServe.",
      cuisine: "Indian",
      city: "Bengaluru",
      gst_percentage: 5,
      container_charge: 0,
      payment_mode: "phonepe",
      is_active: true,
    }).select().single();
    if (rErr) throw rErr;
    console.log("Created restaurant:", r.id);
  } else {
    console.log("Restaurant exists:", rest.id);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
