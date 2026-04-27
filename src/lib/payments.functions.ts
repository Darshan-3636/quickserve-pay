import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generatePickupCode } from "@/lib/format";
import { buildUpiUri, VPA_REGEX } from "@/lib/upi";
import { phonepeCreatePayment, phonepeOrderStatus } from "@/lib/phonepe.server";

const CartLineSchema = z.object({
  menu_item_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  unit_price: z.number().nonnegative(),
  quantity: z.number().int().min(1).max(50),
  diet: z.enum(["veg", "non_veg", "egg"]),
});

const InitiatePaymentSchema = z.object({
  restaurantId: z.string().uuid(),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(10).max(15).regex(/^[0-9+\-\s]+$/),
  lines: z.array(CartLineSchema).min(1).max(50),
  containerCharge: z.number().nonnegative().max(1000),
});

/**
 * Initiates a payment.
 *
 * REAL PHONEPE FLOW (when wired):
 *   1. Compute total server-side from menu_items prices.
 *   2. POST to PhonePe /pg/v1/pay with X-VERIFY = SHA256(payload + endpoint + saltKey) + ## + saltIndex.
 *   3. Return the redirect/intent URL to client.
 *   4. PhonePe later POSTs PAYMENT_SUCCESS to /api/public/phonepe-callback.
 *
 * SIMULATED FLOW (current):
 *   - Creates the order in `pending_payment` state with a merchantTransactionId.
 *   - Returns a simulatedPayUrl pointing at /pay/$txnId where the user can confirm.
 *   - The /pay route calls confirmSimulatedPayment which marks the order paid.
 */
export const initiatePayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InitiatePaymentSchema.parse(input))
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

    // Get restaurant for GST + container charge config
    const { data: restaurant, error: restErr } = await supabaseAdmin
      .from("restaurants")
      .select("id, gst_percentage, container_charge")
      .eq("id", data.restaurantId)
      .maybeSingle();

    if (restErr || !restaurant) {
      return { ok: false as const, error: "Restaurant not found." };
    }

    // Server-authoritative subtotal
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

    // Wait time estimate
    const { count: activeCount } = await supabaseAdmin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["received", "preparing"]);

    const maxPrep = Math.max(
      ...data.lines.map((l) => itemMap.get(l.menu_item_id)?.prep_time_minutes ?? 10)
    );
    const estimatedWait = (activeCount ?? 0) * 3 + maxPrep;

    const merchantTransactionId = `QS_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const pickupCode = generatePickupCode();

    // We need the customer's user id. The client passes auth header via supabase RLS,
    // but for simplicity we look up auth.users via service role using customer_phone is not safe.
    // Instead we rely on the auth context: we'll require the caller to pass a sessionToken.
    // For v1, we accept anon-creates by setting customer_id from JWT in middleware later.
    // Here we use service role and require customer_id at the orders table — pull from secret cookie? Skip for sim.

    return {
      ok: true as const,
      merchantTransactionId,
      pickupCode,
      subtotal: +subtotal.toFixed(2),
      cgst,
      sgst,
      containerCharge,
      total,
      estimatedWait,
      lines: data.lines.map((l) => {
        const item = itemMap.get(l.menu_item_id)!;
        return {
          menu_item_id: l.menu_item_id,
          name: item.name,
          unit_price: Number(item.price),
          quantity: l.quantity,
          diet: item.diet,
        };
      }),
    };
  });

const ConfirmPaymentSchema = z.object({
  merchantTransactionId: z.string().min(1).max(100),
  outcome: z.enum(["success", "failed"]),
});

/**
 * Confirms a simulated payment outcome.
 * In real PhonePe flow, this happens via the webhook at /api/public/phonepe-callback
 * with X-VERIFY signature checked. Here we just toggle the status.
 */
export const confirmSimulatedPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConfirmPaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, payment_status")
      .eq("phonepe_merchant_transaction_id", data.merchantTransactionId)
      .maybeSingle();

    if (error || !order) {
      return { ok: false as const, error: "Order not found." };
    }

    if (order.payment_status !== "pending") {
      return { ok: true as const, alreadyProcessed: true };
    }

    if (data.outcome === "success") {
      const { error: updErr } = await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "success",
          status: "received",
          paid_at: new Date().toISOString(),
          phonepe_transaction_id: `SIM_${Date.now()}`,
        })
        .eq("id", order.id);
      if (updErr) return { ok: false as const, error: updErr.message };
    } else {
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "failed", status: "cancelled" })
        .eq("id", order.id);
    }

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// UPI Intent flow (no payment gateway needed)
// ---------------------------------------------------------------------------

const GetUpiLinkSchema = z.object({
  merchantTransactionId: z.string().min(1).max(100),
});

/**
 * Returns a `upi://pay?...` deep link for an order based on the restaurant's
 * stored UPI VPA + payee name. The customer's phone opens the UPI app picker;
 * money is transferred directly to the restaurant.
 */
export const getOrderUpiLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GetUpiLinkSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, total, restaurant_id, phonepe_merchant_transaction_id, payment_status")
      .eq("phonepe_merchant_transaction_id", data.merchantTransactionId)
      .maybeSingle();
    if (error || !order) return { ok: false as const, error: "Order not found." };

    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("upi_vpa, payee_name, name, payment_mode")
      .eq("id", order.restaurant_id)
      .maybeSingle();

    if (!restaurant?.upi_vpa || !VPA_REGEX.test(restaurant.upi_vpa)) {
      return {
        ok: false as const,
        error: "This restaurant has not configured UPI payouts yet.",
      };
    }

    const uri = buildUpiUri({
      vpa: restaurant.upi_vpa,
      payeeName: restaurant.payee_name || restaurant.name,
      amount: Number(order.total),
      transactionRef: data.merchantTransactionId,
      transactionNote: `QS-${order.id.slice(0, 6).toUpperCase()}`,
    });

    return {
      ok: true as const,
      upiUri: uri,
      vpa: restaurant.upi_vpa,
      payeeName: restaurant.payee_name || restaurant.name,
      amount: Number(order.total),
      paymentMode: restaurant.payment_mode,
      paymentStatus: order.payment_status,
    };
  });

const SubmitUtrSchema = z.object({
  merchantTransactionId: z.string().min(1).max(100),
  upiReferenceId: z
    .string()
    .trim()
    .min(8)
    .max(40)
    .regex(/^[A-Za-z0-9]+$/, "UPI reference must be alphanumeric"),
});

/**
 * Customer submits the UPI reference number (UTR) shown in their UPI app
 * after paying. The order moves to `awaiting_verification` so the merchant
 * can confirm receipt.
 */
export const submitUpiReference = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitUtrSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, payment_status, status")
      .eq("phonepe_merchant_transaction_id", data.merchantTransactionId)
      .maybeSingle();
    if (error || !order) return { ok: false as const, error: "Order not found." };
    if (order.payment_status === "success") {
      return { ok: true as const, alreadyPaid: true };
    }

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        status: "awaiting_verification",
        upi_reference_id: data.upiReferenceId,
      })
      .eq("id", order.id);
    if (updErr) return { ok: false as const, error: updErr.message };

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// PhonePe PG v2 — Sandbox
// ---------------------------------------------------------------------------

const StartPhonePeSchema = z.object({
  orderId: z.string().uuid(),
});

/**
 * Creates a PhonePe sandbox payment session for an existing pending order
 * and returns the PhonePe-hosted checkout redirect URL.
 */
export const startPhonePePayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StartPhonePeSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, total, payment_status, phonepe_merchant_transaction_id, phonepe_order_id"
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) return { ok: false as const, error: "Order not found." };
    if (order.payment_status === "success") {
      return { ok: true as const, redirectUrl: null, alreadyPaid: true as const };
    }
    if (!order.phonepe_merchant_transaction_id) {
      return { ok: false as const, error: "Order has no merchantTransactionId." };
    }

    // Build absolute redirect URL back to /pay/$txn so the user lands on our status page.
    const req = getRequest();
    const origin = req
      ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${
          req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost"
        }`
      : "";
    const redirectUrl = `${origin}/pay/${order.phonepe_merchant_transaction_id}`;

    try {
      const res = await phonepeCreatePayment({
        merchantOrderId: order.phonepe_merchant_transaction_id,
        amountPaise: Math.round(Number(order.total) * 100),
        redirectUrl,
        message: `QuickServe order ${order.id.slice(0, 6).toUpperCase()}`,
      });

      await supabaseAdmin
        .from("orders")
        .update({ phonepe_order_id: res.orderId })
        .eq("id", order.id);

      return { ok: true as const, redirectUrl: res.redirectUrl, alreadyPaid: false as const };
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
 * Polls PhonePe for order status and updates our `orders` row accordingly.
 * Safe to call repeatedly from the /pay/$txn page.
 */
export const refreshPhonePeStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RefreshStatusSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, payment_status, status, phonepe_merchant_transaction_id")
      .eq("phonepe_merchant_transaction_id", data.merchantTransactionId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Order not found." };
    if (order.payment_status === "success") {
      return { ok: true as const, state: "COMPLETED" as const };
    }
    try {
      const status = await phonepeOrderStatus(data.merchantTransactionId);
      const tx = status.paymentDetails?.[0];
      if (status.state === "COMPLETED") {
        await supabaseAdmin
          .from("orders")
          .update({
            payment_status: "success",
            status: "received",
            paid_at: new Date().toISOString(),
            phonepe_transaction_id: tx?.transactionId ?? status.orderId,
            phonepe_order_id: status.orderId,
          })
          .eq("id", order.id);
        return { ok: true as const, state: "COMPLETED" as const };
      }
      if (status.state === "FAILED") {
        await supabaseAdmin
          .from("orders")
          .update({ payment_status: "failed", status: "cancelled" })
          .eq("id", order.id);
        return { ok: true as const, state: "FAILED" as const };
      }
      return { ok: true as const, state: "PENDING" as const };
    } catch (err) {
      console.error("PhonePe status error:", err);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "PhonePe status error",
      };
    }
  });

