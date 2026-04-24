import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ChefHat, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { DietBadge } from "@/components/DietBadge";
import { formatINRDecimal } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];

export const Route = createFileRoute("/order/$id")({
  head: () => ({
    meta: [{ title: "Your order — QuickServe" }, { name: "robots", content: "noindex" }],
  }),
  component: OrderPage,
});

const STATUS_STEPS = [
  { key: "received", label: "Received", icon: CheckCircle2 },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready", icon: PackageCheck },
] as const;

function OrderPage() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data: o }, { data: oi }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", id).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", id),
      ]);
      if (cancelled) return;
      setOrder(o);
      setItems((oi ?? []) as OrderItem[]);
      setLoading(false);
    };
    void load();

    // Realtime updates
    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, (payload) => {
        setOrder(payload.new as Order);
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <StorefrontHeader />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <StorefrontHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Order not found</h1>
          <Button asChild className="mt-4 rounded-full"><Link to="/">Go home</Link></Button>
        </div>
      </div>
    );
  }

  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const isPaid = order.payment_status === "success";

  return (
    <div className="min-h-screen bg-background pb-16">
      <StorefrontHeader />
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        {/* Pickup code hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-3xl border border-primary/30 bg-card-gradient p-6 text-center shadow-elegant md:p-8"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-primary">Your pickup code</div>
          <div className="mt-3 font-display text-7xl font-extrabold tracking-[0.2em] text-gradient-spice md:text-8xl">
            {order.pickup_code}
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Show this code at the counter to collect your order.
          </div>
          {order.estimated_wait_minutes != null && order.status !== "ready" && order.status !== "completed" && (
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Clock className="h-3.5 w-3.5" />
              ~{order.estimated_wait_minutes} min wait
            </div>
          )}
        </motion.div>

        {/* Status track */}
        <div className="mt-6 rounded-3xl border border-border/50 bg-card-gradient p-5">
          <h2 className="font-display text-lg font-bold">Status</h2>
          {!isPaid ? (
            <div className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Payment is pending. <Link to="/pay/$txn" params={{ txn: order.phonepe_merchant_transaction_id! }} className="underline font-semibold">Complete payment</Link>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between">
              {STATUS_STEPS.map((s, i) => {
                const Icon = s.icon;
                const reached = i <= stepIndex;
                return (
                  <div key={s.key} className="flex flex-1 flex-col items-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                        reached
                          ? "border-primary bg-gradient-spice text-primary-foreground shadow-glow"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className={`mt-2 text-xs font-semibold ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div className={`mt-2 hidden h-0.5 w-full ${i < stepIndex ? "bg-primary" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="mt-6 rounded-3xl border border-border/50 bg-card-gradient p-5">
          <h2 className="font-display text-lg font-bold">Items</h2>
          <ul className="mt-3 divide-y divide-border/50">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <DietBadge diet={it.diet} />
                  <div>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatINRDecimal(Number(it.unit_price))} × {it.quantity}
                    </div>
                  </div>
                </div>
                <div className="font-semibold">{formatINRDecimal(Number(it.unit_price) * it.quantity)}</div>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-border/50 pt-3 text-sm">
            <Row label="Subtotal" value={formatINRDecimal(Number(order.subtotal))} />
            <Row label="CGST" value={formatINRDecimal(Number(order.cgst))} muted />
            <Row label="SGST" value={formatINRDecimal(Number(order.sgst))} muted />
            {Number(order.container_charge) > 0 && (
              <Row label="Container" value={formatINRDecimal(Number(order.container_charge))} muted />
            )}
            <Row label="Grand total" value={formatINRDecimal(Number(order.total))} bold />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span className={bold ? "font-display text-base font-bold" : ""}>{label}</span>
      <span className={bold ? "font-display text-base font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
