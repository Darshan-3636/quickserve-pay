import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { Button } from "@/components/ui/button";
import { formatINRDecimal } from "@/lib/format";
import { Receipt } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "My Orders — QuickServe" }] }),
  component: OrdersPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Payment pending",
  received: "Received",
  preparing: "Preparing",
  ready: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/orders" } });
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      setOrders((data ?? []) as Order[]);
      setLoading(false);
    })();
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <StorefrontHeader />
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <h1 className="font-display text-3xl font-bold md:text-4xl">My Orders</h1>

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-12 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-card">
              <Receipt className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No orders yet.</p>
            <Button asChild className="mt-4 rounded-full bg-gradient-spice text-primary-foreground shadow-glow hover:opacity-90">
              <Link to="/menu">Browse menu</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {orders.map((o) => (
              <Link
                key={o.id}
                to="/order/$id"
                params={{ id: o.id }}
                className="block rounded-2xl border border-border/50 bg-card-gradient p-4 transition-all hover:-translate-y-0.5 hover:shadow-elegant"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-primary">Code {o.pickup_code}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg font-bold">{formatINRDecimal(Number(o.total))}</div>
                    <div className="text-xs font-semibold text-primary">{STATUS_LABEL[o.status]}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
