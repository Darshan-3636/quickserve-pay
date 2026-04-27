import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { phonepeOrderStatus } from "@/lib/phonepe.server";

/**
 * PhonePe PG v2 server-to-server webhook.
 *
 * PhonePe POSTs an event payload here when a payment finishes. We don't fully
 * trust the payload — instead we re-call the Order Status API to verify and
 * then update our `orders` row.
 *
 * In production, configure this URL in the PhonePe dashboard along with a
 * username/password (Basic Auth) — PhonePe will send the configured pair in
 * the Authorization header.
 */
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

        // PhonePe sends { event, payload: { merchantOrderId, ... } }
        const inner = (payload.payload ?? payload) as Record<string, unknown>;
        const merchantOrderId =
          (inner.merchantOrderId as string | undefined) ??
          (inner.merchantTransactionId as string | undefined);

        if (!merchantOrderId) {
          return new Response("Missing merchantOrderId", { status: 400 });
        }

        try {
          const status = await phonepeOrderStatus(merchantOrderId);
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
              .eq("phonepe_merchant_transaction_id", merchantOrderId);
          } else if (status.state === "FAILED") {
            await supabaseAdmin
              .from("orders")
              .update({ payment_status: "failed", status: "cancelled" })
              .eq("phonepe_merchant_transaction_id", merchantOrderId);
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
