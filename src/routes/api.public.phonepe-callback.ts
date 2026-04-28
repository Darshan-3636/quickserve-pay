import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { phonepeOrderStatus } from "@/lib/phonepe.server";

export const Route = createFileRoute("/api/public/phonepe-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(body) as Record<string, unknown>;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const inner = (payload.payload ?? payload) as Record<string, unknown>;
        const merchantOrderId =
          (inner.merchantOrderId as string | undefined) ??
          (inner.merchantTransactionId as string | undefined);
        if (!merchantOrderId) return new Response("Missing merchantOrderId", { status: 400 });

        try {
          const status = await phonepeOrderStatus(merchantOrderId);
          const tx = status.paymentDetails?.[0];
          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("id, restaurant_id, payment_status")
            .eq("phonepe_merchant_transaction_id", merchantOrderId)
            .maybeSingle();
          if (!order) return new Response("Order not found", { status: 404 });
          if (order.payment_status === "success") return new Response("ok");

          if (status.state === "COMPLETED") {
            const { data: codeRes } = await supabaseAdmin.rpc("generate_unique_pickup_code", {
              _restaurant_id: order.restaurant_id,
            });
            await supabaseAdmin
              .from("orders")
              .update({
                payment_status: "success",
                status: "received",
                paid_at: new Date().toISOString(),
                pickup_code: (codeRes as string) ?? "----",
                phonepe_transaction_id: tx?.transactionId ?? status.orderId,
                phonepe_order_id: status.orderId,
              })
              .eq("id", order.id);
          } else if (status.state === "FAILED") {
            await supabaseAdmin
              .from("orders")
              .update({ payment_status: "failed", status: "cancelled" })
              .eq("id", order.id);
          }
        } catch (err) {
          console.error("PhonePe webhook lookup failed:", err);
          return new Response("Verification failed", { status: 502 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
