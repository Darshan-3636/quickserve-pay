import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, Trash2, Clock } from "lucide-react";
import { z } from "zod";
import { useCart, cartStore } from "@/lib/cart-store";
import { supabase } from "@/integrations/supabase/client";
import { createGuestOrderAndPay } from "@/lib/payments.functions";
import { formatINR, formatINRDecimal, estimateWaitMinutes } from "@/lib/format";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { DietBadge } from "@/components/DietBadge";
import { resolveDishImage } from "@/lib/dish-images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — QuickServe" },
      { name: "description", content: "Enter your name & phone, pay with PhonePe, get a 4-digit pickup code." },
    ],
  }),
  component: CheckoutPage,
});

const checkoutSchema = z.object({
  customerName: z.string().trim().min(1, "Name is required").max(100),
  customerPhone: z
    .string()
    .trim()
    .min(10, "Enter a valid mobile number")
    .max(15)
    .regex(/^[0-9+\-\s]+$/, "Invalid phone"),
});

function CheckoutPage() {
  const cart = useCart();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [activeOrders, setActiveOrders] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cart.restaurantId) return;
    let cancelled = false;
    void (async () => {
      const [{ data: rest }, { count }] = await Promise.all([
        supabase.from("restaurants").select("*").eq("id", cart.restaurantId!).maybeSingle(),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("restaurant_id", cart.restaurantId!)
          .in("status", ["received", "preparing"]),
      ]);
      if (cancelled) return;
      setRestaurant(rest);
      setActiveOrders(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [cart.restaurantId]);

  const totals = useMemo(() => {
    const subtotal = cart.subtotal;
    const gst = restaurant ? (subtotal * Number(restaurant.gst_percentage)) / 100 : 0;
    const cgst = +(gst / 2).toFixed(2);
    const sgst = +(gst - cgst).toFixed(2);
    const containerCharge = restaurant ? Number(restaurant.container_charge) : 0;
    const total = +(subtotal + cgst + sgst + containerCharge).toFixed(2);
    return { subtotal, cgst, sgst, containerCharge, total };
  }, [cart.subtotal, restaurant]);

  const waitMinutes = estimateWaitMinutes(activeOrders, cart.maxPrep);

  const handlePay = async () => {
    const parsed = checkoutSchema.safeParse({ customerName: name, customerPhone: phone });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
      setErrors(errs);
      return;
    }
    if (!cart.restaurantId || cart.lines.length === 0 || !restaurant) return;

    setBusy(true);
    setErrors({});

    const res = await createGuestOrderAndPay({
      data: {
        restaurantId: cart.restaurantId,
        customerName: name,
        customerPhone: phone,
        lines: cart.lines.map((l) => ({
          menu_item_id: l.item.id,
          name: l.item.name,
          unit_price: Number(l.item.price),
          quantity: l.quantity,
          diet: l.item.diet,
        })),
      },
    }).catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    }));

    if (!res.ok) {
      toast.error(res.error || "Could not start payment");
      setBusy(false);
      return;
    }

    // Persist txn id locally so the success page can retrieve it on return.
    try {
      sessionStorage.setItem(`qs_txn_${res.merchantTransactionId}`, res.orderId);
    } catch {
      /* ignore */
    }

    if (res.redirectUrl) {
      window.location.href = res.redirectUrl;
      return;
    }
    // Fallback (shouldn't happen with PhonePe configured)
    window.location.href = `/pay/${res.merchantTransactionId}`;
  };

  if (cart.lines.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <StorefrontHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-card">
            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="font-display text-2xl font-bold">Your cart is empty</h1>
          <p className="mt-2 text-sm text-muted-foreground">Browse the menu to add some delicious dishes.</p>
          <Button asChild className="mt-6 rounded-full bg-gradient-spice text-primary-foreground shadow-glow hover:opacity-90">
            <Link to="/explore">Browse menu</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <StorefrontHeader />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1fr_360px] md:px-6">
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">Checkout</h1>
          <p className="mt-1 text-sm text-muted-foreground">{restaurant?.name}</p>

          <div className="mt-6 space-y-3">
            {cart.lines.map(({ item, quantity }) => (
              <motion.div
                key={item.id}
                layout
                className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card-gradient p-3"
              >
                <img
                  src={resolveDishImage(item.image_url)}
                  alt={item.name}
                  width={80}
                  height={80}
                  loading="lazy"
                  className="h-16 w-16 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <DietBadge diet={item.diet} />
                    <h3 className="truncate font-semibold">{item.name}</h3>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatINR(Number(item.price))} each</div>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1">
                  <button
                    onClick={() => cartStore.remove(item.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Decrease"
                  >
                    {quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{quantity}</span>
                  <button
                    onClick={() => cartStore.add(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-spice text-primary-foreground"
                    aria-label="Increase"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-8">
            <h2 className="font-display text-lg font-bold">Pickup details</h2>
            <p className="text-sm text-muted-foreground">No account needed. Just your name & phone.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cn">Name</Label>
                <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} className="bg-input/50" />
                {errors.customerName && <p className="text-xs text-destructive">{errors.customerName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp">Mobile</Label>
                <Input
                  id="cp"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-input/50"
                  placeholder="98xxxxxxxx"
                />
                {errors.customerPhone && <p className="text-xs text-destructive">{errors.customerPhone}</p>}
              </div>
            </div>
          </div>
        </div>

        <aside className="md:sticky md:top-24 md:self-start">
          <div className="rounded-3xl border border-border/50 bg-card-gradient p-5 shadow-elegant">
            <h2 className="font-display text-lg font-bold">Order summary</h2>

            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                Estimated wait <span className="font-bold">~{waitMinutes} min</span>
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Subtotal" value={formatINRDecimal(totals.subtotal)} />
              <Row label="CGST (2.5%)" value={formatINRDecimal(totals.cgst)} muted />
              <Row label="SGST (2.5%)" value={formatINRDecimal(totals.sgst)} muted />
              {totals.containerCharge > 0 && (
                <Row label="Container charge" value={formatINRDecimal(totals.containerCharge)} muted />
              )}
              <div className="my-2 h-px bg-border/60" />
              <Row label="Grand total" value={formatINRDecimal(totals.total)} bold />
            </dl>

            <Button
              onClick={handlePay}
              disabled={busy}
              size="lg"
              className="mt-5 w-full rounded-full bg-gradient-spice text-base font-semibold text-primary-foreground shadow-glow hover:opacity-90"
            >
              {busy ? "Redirecting to PhonePe..." : `Pay ${formatINRDecimal(totals.total)} with PhonePe`}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Secured by PhonePe (sandbox)
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <dt className={bold ? "font-display text-base font-bold" : ""}>{label}</dt>
      <dd className={bold ? "font-display text-base font-bold" : "font-medium"}>{value}</dd>
    </div>
  );
}
