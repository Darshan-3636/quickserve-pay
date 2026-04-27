import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Smartphone, CheckCircle2, XCircle, Loader2, Copy, ExternalLink, Clock } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getOrderUpiLink, submitUpiReference, refreshPhonePeStatus } from "@/lib/payments.functions";
import { cartStore } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpiQrCode } from "@/components/UpiQrCode";
import { formatINRDecimal } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

export const Route = createFileRoute("/pay/$txn")({
  head: () => ({
    meta: [
      { title: "Pay with UPI — QuickServe" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PayPage,
});

const utrSchema = z
  .string()
  .trim()
  .min(8, "UTR is at least 8 characters")
  .max(40)
  .regex(/^[A-Za-z0-9]+$/, "Only letters and numbers");

function PayPage() {
  const { txn } = Route.useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [upiUri, setUpiUri] = useState<string | null>(null);
  const [vpa, setVpa] = useState<string>("");
  const [payeeName, setPayeeName] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [utr, setUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Initial load — fetch order + generated UPI link in parallel
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: ord }, linkRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("phonepe_merchant_transaction_id", txn)
          .maybeSingle(),
        getOrderUpiLink({ data: { merchantTransactionId: txn } }),
      ]);
      if (cancelled) return;
      setOrder(ord);
      if (linkRes.ok) {
        setUpiUri(linkRes.upiUri);
        setVpa(linkRes.vpa);
        setPayeeName(linkRes.payeeName);
      } else {
        setLoadError(linkRes.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [txn]);

  // Poll for status every 4s — first ask PhonePe (sandbox) then re-read our order row.
  // Stops once paid/failed.
  useEffect(() => {
    if (!order) return;
    if (order.payment_status === "success" || order.payment_status === "failed") return;
    const tick = async () => {
      // Ask PhonePe; this also updates our orders row server-side.
      await refreshPhonePeStatus({
        data: { merchantTransactionId: txn },
      }).catch(() => undefined);
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("phonepe_merchant_transaction_id", txn)
        .maybeSingle();
      if (data) {
        setOrder(data);
        if (data.payment_status === "success") {
          cartStore.clear();
          toast.success("Payment confirmed!");
          navigate({ to: "/order/$id", params: { id: data.id } });
        }
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 4000);
    return () => clearInterval(id);
  }, [order, txn, navigate]);

  const copyVpa = async () => {
    try {
      await navigator.clipboard.writeText(vpa);
      toast.success("UPI ID copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const submitUtr = async () => {
    const parsed = utrSchema.safeParse(utr);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSubmitting(true);
    const res = await submitUpiReference({
      data: { merchantTransactionId: txn, upiReferenceId: parsed.data },
    });
    setSubmitting(false);
    if (!res.ok) return toast.error(res.error);
    if (res.alreadyPaid && order) {
      cartStore.clear();
      navigate({ to: "/order/$id", params: { id: order.id } });
      return;
    }
    toast.success("Reference submitted — waiting for the restaurant to confirm.");
    // refresh
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("phonepe_merchant_transaction_id", txn)
      .maybeSingle();
    if (data) setOrder(data);
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

  if (loadError || !upiUri) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <XCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-3 font-display text-2xl font-bold">UPI not configured</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError ?? "This restaurant hasn't set up payments yet. Please contact them."}
          </p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const awaiting = order.status === "awaiting_verification";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="absolute inset-0 bg-radial-glow" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border border-border/50 bg-card-gradient p-6 shadow-elegant md:p-8"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-spice text-primary-foreground">
            <Smartphone className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Pay via</div>
            <div className="font-display text-xl font-bold">UPI — Any app</div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border/50 bg-background/40 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Paying</span>
            <span className="font-semibold">{payeeName}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">UPI ID</span>
            <button
              onClick={copyVpa}
              className="flex items-center gap-1 font-mono text-sm font-semibold text-primary hover:underline"
            >
              {vpa}
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
            <span className="text-sm text-muted-foreground">Amount</span>
            <span className="font-display text-2xl font-bold">{formatINRDecimal(Number(order.total))}</span>
          </div>
        </div>

        {/* Mobile: deep link button. Desktop: still works as a copyable link. */}
        <a href={upiUri} className="mt-5 block">
          <Button
            size="lg"
            className="w-full rounded-full bg-gradient-spice text-base font-semibold text-primary-foreground shadow-glow hover:opacity-90"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open UPI app to pay
          </Button>
        </a>

        {/* QR for desktop */}
        <div className="mt-6 flex flex-col items-center">
          <UpiQrCode value={upiUri} size={180} />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            On desktop? Scan with any UPI app on your phone.
          </p>
        </div>

        {/* UTR submission */}
        <div className="mt-6 rounded-2xl border border-border/50 bg-background/40 p-4">
          {awaiting ? (
            <div className="flex items-start gap-3 text-sm">
              <Clock className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <div className="font-semibold">Waiting for restaurant confirmation</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your reference <code className="rounded bg-muted px-1">{order.upi_reference_id}</code> was sent. The
                  page will update automatically once they confirm receipt.
                </p>
              </div>
            </div>
          ) : (
            <>
              <Label htmlFor="utr" className="text-sm font-semibold">
                Already paid? Enter your UPI reference
              </Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Find this in your UPI app under "Transaction details" → UTR / Reference No.
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  id="utr"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.toUpperCase())}
                  placeholder="e.g. 412345678901"
                  className="bg-input/50 font-mono"
                  maxLength={40}
                />
                <Button onClick={submitUtr} disabled={submitting} className="rounded-full">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Money goes directly to the restaurant. QuickServe never holds funds.
        </p>
      </motion.div>
    </div>
  );
}
