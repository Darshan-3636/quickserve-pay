import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ChefHat, PackageCheck, Home } from "lucide-react";
import { getGuestOrder } from "@/lib/orders.functions";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { DietBadge } from "@/components/DietBadge";
import { formatINRDecimal } from "@/lib/format";
import { Button } from "@/components/ui/button";

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

type Diet = "veg" | "non_veg" | "egg";
interface OrderData {
  id: string;
  customer_name: string;
  pickup_code: string;
  status: string;
  payment_status: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  container_charge: number;
  total: number;
  estimated_wait_minutes: number | null;
}
interface ItemData {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  diet: Diet;
}

function OrderPage() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<ItemData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await getGuestOrder({ data: { orderId: id } }).catch(() => null);
      if (cancelled || !res || !res.ok) {
        if (!cancelled) setLoading(false);
        return;
      }
      setOrder(res.order as OrderData);
      setItems(res.items as ItemData[]);
      setLoading(false);
    };
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
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

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === order.status);

  return (
    <div className="min-h-screen bg-background">
      <StorefrontHeader />
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <h1 className="font-display text-3xl font-bold">Hi {order.customer_name}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here's your order status.</p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-3xl border border-primary/30 bg-primary/10 p-6 text-center shadow-elegant"
        >
          <div className="text-xs uppercase tracking-widest text-primary">Pickup code</div>
          <div className="mt-2 font-display text-5xl font-extrabold tracking-[0.4em]">{order.pickup_code}</div>
          {order.estimated_wait_minutes !== null && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> ~{order.estimated_wait_minutes} min
            </p>
          )}
        </motion.div>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-border/50 bg-card p-4">
          {STATUS_STEPS.map((step, i) => {
            const Icon = step.icon;
            const done = currentStepIdx >= i;
            return (
              <div key={step.key} className="flex flex-1 flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    done ? "bg-gradient-spice text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-2 text-xs font-semibold">{step.label}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-border/50 bg-card p-4">
          <h2 className="font-display text-lg font-bold">Items</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DietBadge diet={it.diet} />
                  <span>
                    {it.name} × {it.quantity}
                  </span>
                </div>
                <span className="font-medium">{formatINRDecimal(Number(it.unit_price) * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-border/40 pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{formatINRDecimal(Number(order.subtotal))}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxes</span><span>{formatINRDecimal(Number(order.cgst) + Number(order.sgst))}</span>
            </div>
            <div className="mt-1 flex justify-between font-display text-base font-bold">
              <span>Total paid</span><span>{formatINRDecimal(Number(order.total))}</span>
            </div>
          </div>
        </div>

        <Button asChild variant="outline" className="mt-6 w-full rounded-full">
          <Link to="/"><Home className="mr-2 h-4 w-4" />Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
