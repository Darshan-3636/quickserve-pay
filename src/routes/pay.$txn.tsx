import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Smartphone, QrCode, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { confirmSimulatedPayment } from "@/lib/payments.functions";
import { cartStore } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import { formatINRDecimal } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

export const Route = createFileRoute("/pay/$txn")({
  head: () => ({
    meta: [
      { title: "Pay with PhonePe — QuickServe" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PayPage,
});

function PayPage() {
  const { txn } = Route.useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("phonepe_merchant_transaction_id", txn)
        .maybeSingle();
      if (!cancelled) {
        setOrder(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txn]);

  const handle = async (outcome: "success" | "failed") => {
    setProcessing(true);
    const res = await confirmSimulatedPayment({ data: { merchantTransactionId: txn, outcome } });
    setProcessing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (outcome === "success") {
      cartStore.clear();
      toast.success("Payment successful!");
      if (order) navigate({ to: "/order/$id", params: { id: order.id } });
    } else {
      toast.error("Payment failed");
      navigate({ to: "/checkout" });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">Transaction not found</h1>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="absolute inset-0 bg-radial-glow" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border border-border/50 bg-card-gradient p-6 shadow-elegant md:p-8"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#5f259f] text-white">
            <Smartphone className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Pay via</div>
            <div className="font-display text-xl font-bold">PhonePe (Sandbox)</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border/50 bg-background/40 p-4">
          <div className="text-xs text-muted-foreground">Merchant Transaction ID</div>
          <div className="truncate font-mono text-sm font-semibold">{txn}</div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Amount due</span>
            <span className="font-display text-2xl font-bold">{formatINRDecimal(Number(order.total))}</span>
          </div>
        </div>

        {/* Mock QR */}
        <div className="mt-6 flex flex-col items-center">
          <div className="flex h-44 w-44 items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-background/60">
            <QrCode className="h-20 w-20 text-primary/70" />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            On a real device, the PhonePe app would open via UPI Intent.<br />
            Simulator: choose an outcome below.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            disabled={processing}
            onClick={() => handle("failed")}
            className="rounded-full border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Fail
          </Button>
          <Button
            disabled={processing}
            onClick={() => handle("success")}
            className="rounded-full bg-gradient-spice text-primary-foreground shadow-glow hover:opacity-90"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Success
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <strong className="text-primary">Dev note:</strong> when you add real PhonePe keys, replace this
          screen with a redirect to the PhonePe-issued payment URL. Status will be set automatically by the
          signed webhook at <code className="rounded bg-background/60 px-1">/api/public/phonepe-callback</code>.
        </div>
      </motion.div>
    </div>
  );
}
