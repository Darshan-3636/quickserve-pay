import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { phonepeCreatePayment, phonepeOrderStatus } from "@/lib/phonepe.server";

const CartLineSchema = z.object({
  menu_item_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  unit_price: z.number().nonnegative(),
  quantity: z.number().int().min(1).max(50),
  diet: z.enum(["veg", "non_veg", "egg"]),
});

const CreateOrderSchema = z.object({
  restaurantId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(100),
  customerPhone: z.string().trim().min(10).max(15).regex(/^[0-9+\-\s]+$/),
  lines: z.array(CartLineSchema).min(1).max(50),
});

/**
 * Creates a pending guest order (no customer_id, no pickup_code yet) and
 * starts a PhonePe sandbox payment. Returns the redirect URL.
 *
 * The unique 4-digit pickup code is generated ONLY after PhonePe confirms the
 * payment (see refreshPhonePeStatus / phonepe-callback).
 */
export const createGuestOrderAndPay = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateOrderSchema.parse(input))
  .handler(async ({ data }) => {
    // Re-fetch authoritative prices server-side. NEVER trust client prices.
    const itemIds = data.lines.map((l) => l.menu_item_id);
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("menu_items")
      .select("id, name, price, diet, is_in_stock, restaurant_id, prep_time_minutes")
      .in("id", itemIds);

    if (itemsErr || !items) {
      return { ok: false as const, error: "Failed to load menu items." };
    }

    const itemMap = new Map(items.map((i) => [i.id, i]));
    for (const line of data.lines) {
      const item = itemMap.get(line.menu_item_id);
      if (!item) return { ok: false as const, error: `Item not found: ${line.name}` };
      if (item.restaurant_id !== data.restaurantId) {
        return { ok: false as const, error: "Cart contains items from a different restaurant." };
      }
      if (!item.is_in_stock) {
        return { ok: false as const, error: `${item.name} is out of stock.` };
      }
    }

    const { data: restaurant, error: restErr } = await supabaseAdmin
      .from("restaurants")
      .select("id, gst_percentage, container_charge")
      .eq("id", data.restaurantId)
      .maybeSingle();

    if (restErr || !restaurant) {
      return { ok: false as const, error: "Restaurant not found." };
    }

    const subtotal = data.lines.reduce((sum, line) => {
      const item = itemMap.get(line.menu_item_id)!;
      return sum + Number(item.price) * line.quantity;
    }, 0);

    const gstRate = Number(restaurant.gst_percentage) / 100;
    const gstAmount = +(subtotal * gstRate).toFixed(2);
    const cgst = +(gstAmount / 2).toFixed(2);
    const sgst = +(gstAmount - cgst).toFixed(2);
    const containerCharge = Number(restaurant.container_charge) || 0;
    const total = +(subtotal + cgst + sgst + containerCharge).toFixed(2);

    const { count: activeCount } = await supabaseAdmin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["received", "preparing"]);

    const maxPrep = Math.max(
      ...data.lines.map((l) => itemMap.get(l.menu_item_id)?.prep_time_minutes ?? 10)
    );
    const estimatedWait = (activeCount ?? 0) * 3 + maxPrep;

    const merchantTransactionId = `QS_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

    // Insert pending order with NO pickup code yet (placeholder "----").
    const { data: order, error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert({
        restaurant_id: data.restaurantId,
        customer_id: null, // guest order
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        pickup_code: "----",
        status: "pending_payment",
        payment_status: "pending",
        subtotal: +subtotal.toFixed(2),
        cgst,
        sgst,
        container_charge: containerCharge,
        total,
        estimated_wait_minutes: estimatedWait,
        phonepe_merchant_transaction_id: merchantTransactionId,
      })
      .select("id")
      .single();

    if (insertErr || !order) {
      return { ok: false as const, error: insertErr?.message ?? "Could not create order." };
    }

    await supabaseAdmin.from("order_items").insert(
      data.lines.map((l) => {
        const item = itemMap.get(l.menu_item_id)!;
        return {
          order_id: order.id,
          menu_item_id: l.menu_item_id,
          name: item.name,
          unit_price: Number(item.price),
          quantity: l.quantity,
          diet: item.diet,
        };
      })
    );

    // Build absolute redirect URL.
    const req = getRequest();
    const origin = req
      ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${
          req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost"
        }`
      : "";
    const redirectUrl = `${origin}/pay/${merchantTransactionId}`;

    try {
      const res = await phonepeCreatePayment({
        merchantOrderId: merchantTransactionId,
        amountPaise: Math.round(total * 100),
        redirectUrl,
        message: `QuickServe order ${order.id.slice(0, 6).toUpperCase()}`,
      });
      await supabaseAdmin
        .from("orders")
        .update({ phonepe_order_id: res.orderId })
        .eq("id", order.id);
      return {
        ok: true as const,
        orderId: order.id,
        merchantTransactionId,
        redirectUrl: res.redirectUrl,
      };
    } catch (err) {
      console.error("PhonePe create-payment error:", err);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "PhonePe error",
      };
    }
  });

const RefreshStatusSchema = z.object({
  merchantTransactionId: z.string().min(1).max(100),
});

/**
 * Polls PhonePe for status. On COMPLETED, generates the unique 4-digit pickup
 * code via the DB function and marks the order paid.
 */
export const refreshPhonePeStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RefreshStatusSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, payment_status, status, restaurant_id, pickup_code")
      .eq("phonepe_merchant_transaction_id", data.merchantTransactionId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Order not found." };
    if (order.payment_status === "success") {
      return {
        ok: true as const,
        state: "COMPLETED" as const,
        orderId: order.id,
        pickupCode: order.pickup_code,
      };
    }
    try {
      const status = await phonepeOrderStatus(data.merchantTransactionId);
      const tx = status.paymentDetails?.[0];
      if (status.state === "COMPLETED") {
        // Generate unique 4-digit code
        const { data: codeRes, error: codeErr } = await supabaseAdmin.rpc(
          "generate_unique_pickup_code",
          { _restaurant_id: order.restaurant_id }
        );
        const pickupCode = codeErr || !codeRes ? "----" : (codeRes as string);
        await supabaseAdmin
          .from("orders")
          .update({
            payment_status: "success",
            status: "received",
            paid_at: new Date().toISOString(),
            pickup_code: pickupCode,
            phonepe_transaction_id: tx?.transactionId ?? status.orderId,
            phonepe_order_id: status.orderId,
          })
          .eq("id", order.id);
        return {
          ok: true as const,
          state: "COMPLETED" as const,
          orderId: order.id,
          pickupCode,
        };
      }
      if (status.state === "FAILED") {
        await supabaseAdmin
          .from("orders")
          .update({ payment_status: "failed", status: "cancelled" })
          .eq("id", order.id);
        return { ok: true as const, state: "FAILED" as const, orderId: order.id };
      }
      return { ok: true as const, state: "PENDING" as const, orderId: order.id };
    } catch (err) {
      console.error("PhonePe status error:", err);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "PhonePe status error",
      };
    }
  });
