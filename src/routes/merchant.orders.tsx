import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINRDecimal } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
type OrderStatus = Database["public"]["Enums"]["order_status"];

export const Route = createFileRoute("/merchant/orders")({
  component: MerchantOrders,
});

const STATUS_FLOW: Record<string, { next: OrderStatus; label: string }> = {
  received: { next: "preparing", label: "Start preparing" },
  preparing: { next: "ready", label: "Mark ready" },
};

function MerchantOrders() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [pending, setPending] = useState<Order[]>([]);
  const [active, setActive] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [code, setCode] = useState("");

  const reload = async (rid: string) => {
    const [{ data: pendingData }, { data: activeData }] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", rid)
        .eq("status", "awaiting_verification")
        .order("created_at", { ascending: true }),
      supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", rid)
        .eq("payment_status", "success")
        .in("status", ["received", "preparing", "ready"])
        .order("created_at", { ascending: true }),
    ]);
    setPending((pendingData ?? []) as Order[]);
    setActive((activeData ?? []) as Order[]);
  };

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: rest } = await supabase.from("restaurants").select("id").eq("owner_id", user.id).maybeSingle();
      if (!rest) return;
      setRestaurantId(rest.id);
      await reload(rest.id);

      const channel = supabase
        .channel(`merchant-orders-${rest.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${rest.id}` },
          () => void reload(rest.id),
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    })();
  }, [user]);

  useEffect(() => {
    if (!selected) {
      setItems([]);
      return;
    }
    void supabase.from("order_items").select("*").eq("order_id", selected.id).then(({ data }) => {
      setItems((data ?? []) as OrderItem[]);
    });
  }, [selected]);

  const advance = async (o: Order) => {
    const flow = STATUS_FLOW[o.status];
    if (!flow) return;
    const { error } = await supabase.from("orders").update({ status: flow.next }).eq("id", o.id);
    if (error) return toast.error(error.message);
    if (restaurantId) await reload(restaurantId);
    toast.success("Updated");
  };

  const confirmPayment = async (o: Order) => {
    if (!user) return;
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "success",
        status: "received",
        paid_at: new Date().toISOString(),
        manual_verified_by: user.id,
      })
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success(`Order ${o.pickup_code} confirmed`);
    if (restaurantId) await reload(restaurantId);
  };

  const rejectPayment = async (o: Order) => {
    const { error } = await supabase
      .from("orders")
      .update({ payment_status: "failed", status: "cancelled" })
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    if (restaurantId) await reload(restaurantId);
  };

  const handover = async () => {
    if (!selected) return;
    const parsed = z.string().regex(/^\d{4}$/).safeParse(code.trim());
    if (!parsed.success) return toast.error("Enter a 4-digit code");
    if (parsed.data !== selected.pickup_code) {
      return toast.error("Code does not match");
    }
    const { error } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Handed over!");
    setCode("");
    setSelected(null);
    if (restaurantId) await reload(restaurantId);
  };

  return (
    <div className="grid gap-4 p-4 md:grid-cols-[1fr_360px] md:p-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Live Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pending.length} awaiting payment confirmation · {active.length} active
        </p>

        {/* AWAITING VERIFICATION SECTION */}
        {pending.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <h2 className="font-display text-lg font-bold">Awaiting payment confirmation</h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Customer says they paid via UPI. Check your UPI app / SMS for the credit, then confirm or reject.
            </p>
            <div className="space-y-3">
              {pending.map((o) => (
                <div key={o.id} className="rounded-2xl border border-amber-300/60 bg-amber-50/40 p-4 dark:bg-amber-950/20">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-amber-700">Code {o.pickup_code}</div>
                      <div className="mt-0.5 text-sm font-semibold">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                      <div className="mt-2 text-xs">
                        <span className="text-muted-foreground">UPI Ref:</span>{" "}
                        <code className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs font-bold">
                          {o.upi_reference_id ?? "—"}
                        </code>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-xl font-bold">{formatINRDecimal(Number(o.total))}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void rejectPayment(o)}
                      className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => void confirmPayment(o)} className="rounded-full">
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Confirm received
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ACTIVE ORDERS */}
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold">Active</h2>
          <div className="space-y-3">
            {active.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelected(o)}
                className={`w-full rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  selected?.id === o.id ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-primary">Code {o.pickup_code}</div>
                    <div className="mt-0.5 text-sm font-semibold">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg font-bold">{formatINRDecimal(Number(o.total))}</div>
                    <StatusPill status={o.status} />
                  </div>
                </div>
                {STATUS_FLOW[o.status] && (
                  <Button
                    size="sm"
                    className="mt-3 w-full rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      void advance(o);
                    }}
                  >
                    {STATUS_FLOW[o.status].label}
                  </Button>
                )}
              </button>
            ))}
            {active.length === 0 && pending.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
                No active orders. They'll appear here in real-time.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Right panel */}
      <aside className="md:sticky md:top-4 md:self-start">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-lg font-bold">Pickup verification</h2>
          {selected ? (
            <>
              <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm">
                <div className="font-semibold">{selected.customer_name}</div>
                <div className="text-xs text-muted-foreground">{selected.customer_phone}</div>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {items.map((it) => (
                  <li key={it.id} className="flex justify-between">
                    <span>
                      {it.name} × {it.quantity}
                    </span>
                    <span className="font-medium">{formatINRDecimal(Number(it.unit_price) * it.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-between border-t border-border pt-3 font-display font-bold">
                <span>Grand total</span>
                <span>{formatINRDecimal(Number(selected.total))}</span>
              </div>
              {selected.status === "ready" ? (
                <div className="mt-4 space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Customer code</label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="0000"
                    className="text-center font-display text-2xl tracking-[0.5em]"
                  />
                  <Button onClick={handover} className="w-full rounded-full">
                    Confirm handover
                  </Button>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Mark order as <strong>Ready</strong> to enable pickup verification.
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Select an order to verify pickup.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const styles: Record<string, string> = {
    received: "bg-blue-100 text-blue-700",
    preparing: "bg-amber-100 text-amber-700",
    ready: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${styles[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}
