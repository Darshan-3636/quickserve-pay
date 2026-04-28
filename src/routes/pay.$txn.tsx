import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Home } from "lucide-react";
import { refreshPhonePeStatus } from "@/lib/payments.functions";
import { cartStore } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import { formatINRDecimal } from "@/lib/format";

export const Route = createFileRoute("/pay/$txn")({
  head: () => ({
    meta: [{ title: "Confirming payment — QuickServe" }, { name: "robots", content: "noindex" }],
  }),
  component: PayPage,
});

type State = "PENDING" | "COMPLETED" | "FAILED";

function PayPage() {
  const { txn } = Route.useParams();
  const [state, setState] = useState<State>("PENDING");
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      attempts++;
      const res = await refreshPhonePeStatus({
        data: { merchantTransactionId: txn },
      }).catch(() => null);
      if (cancelled || !res) return;
      if (!res.ok) {
        if (attempts > 30) setState("FAILED");
        return;
      }
      if (res.state === "COMPLETED") {
        setState("COMPLETED");
        setPickupCode(res.pickupCode ?? null);
        setOrderId(res.orderId);
        cartStore.clear();
      } else if (res.state === "FAILED") {
        setState("FAILED");
        setOrderId(res.orderId);
      }
    };

    void tick();
    const id = setInterval(() => {
      if (cancelled) return;
      if (state === "COMPLETED" || state === "FAILED") return;
      void tick();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [txn, state]);

  // Fetch order amount once for display
  useEffect(() => {
    if (!orderId || amount !== null) return;
    void (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("orders")
        .select("total")
        .eq("id", orderId)
        .maybeSingle();
      if (data) setAmount(Number(data.total));
    })();
  }, [orderId, amount]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="absolute inset-0 bg-radial-glow" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border border-border/50 bg-card-gradient p-8 text-center shadow-elegant"
      >
        {state === "PENDING" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-2xl font-bold">Confirming your payment…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We're checking with PhonePe. This usually takes a few seconds.
            </p>
          </>
        )}

        {state === "COMPLETED" && (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold">Payment successful!</h1>
            {amount !== null && (
              <p className="mt-1 text-sm text-muted-foreground">
                {formatINRDecimal(amount)} paid
              </p>
            )}
            <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5">
              <div className="text-xs uppercase tracking-widest text-primary">Your pickup code</div>
              <div className="mt-2 font-display text-5xl font-extrabold tracking-[0.4em] text-foreground">
                {pickupCode ?? "----"}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Show this 4-digit code at the counter to collect your order.
              </p>
            </div>
            {orderId && (
              <Button asChild className="mt-6 w-full rounded-full bg-gradient-spice text-primary-foreground shadow-glow hover:opacity-90">
                <Link to="/order/$id" params={{ id: orderId }}>
                  Track order
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="mt-2 w-full rounded-full">
              <Link to="/">
                <Home className="mr-2 h-4 w-4" />
                Back to home
              </Link>
            </Button>
          </>
        )}

        {state === "FAILED" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 font-display text-2xl font-bold">Payment failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your payment could not be confirmed. Please try again.
            </p>
            <Button asChild className="mt-6 w-full rounded-full">
              <Link to="/checkout">Back to checkout</Link>
            </Button>
            <Button asChild variant="outline" className="mt-2 w-full rounded-full">
              <Link to="/">Back to home</Link>
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}
