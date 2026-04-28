import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Schema = z.object({ orderId: z.string().uuid() });

/**
 * Public guest-safe lookup for an order by id. Returns only fields safe to expose.
 */
export const getGuestOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const [{ data: order }, { data: items }] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select(
          "id, customer_name, pickup_code, status, payment_status, subtotal, cgst, sgst, container_charge, total, estimated_wait_minutes, paid_at, ready_at, completed_at, created_at, restaurant_id"
        )
        .eq("id", data.orderId)
        .maybeSingle(),
      supabaseAdmin
        .from("order_items")
        .select("id, name, unit_price, quantity, diet")
        .eq("order_id", data.orderId),
    ]);
    if (!order) return { ok: false as const, error: "Order not found" };
    return { ok: true as const, order, items: items ?? [] };
  });
