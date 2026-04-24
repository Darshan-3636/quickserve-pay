import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Clock, ShieldCheck, Sparkles, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { seedDemoRestaurant } from "@/lib/seed.functions";
import { resolveDishImage, heroImage } from "@/lib/dish-images";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { DietBadge } from "@/components/DietBadge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { cartStore } from "@/lib/cart-store";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QuickServe — Order, pay & pickup with PhonePe UPI" },
      {
        name: "description",
        content:
          "Pre-paid Indian food ordering. Browse the menu, pay with UPI, walk in with a 4-digit code. No queues.",
      },
      { property: "og:title", content: "QuickServe — Order, pay & pickup with UPI" },
      {
        property: "og:description",
        content: "Skip the queue. Pay with PhonePe. Pickup with a 4-digit code.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [featured, setFeatured] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Seed demo restaurant on first load
      const seedRes = await seedDemoRestaurant({ data: {} }).catch((e) => ({
        ok: false as const,
        error: String(e),
      }));
      if (!seedRes.ok) {
        console.error("Seed failed:", seedRes.error);
      }

      const { data: rest } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", "spice-junction")
        .maybeSingle();

      if (cancelled) return;
      setRestaurant(rest);

      if (rest) {
        const { data: items } = await supabase
          .from("menu_items")
          .select("*")
          .eq("restaurant_id", rest.id)
          .eq("is_in_stock", true)
          .order("is_featured", { ascending: false })
          .order("sort_order")
          .limit(6);
        if (!cancelled) setFeatured((items ?? []) as MenuItem[]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddToCart = (item: MenuItem) => {
    cartStore.add(item);
    toast.success(`Added ${item.name}`, { duration: 1500 });
  };

  return (
    <div className="min-h-screen bg-background">
      <StorefrontHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-glow" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-16 md:grid-cols-2 md:gap-6 md:px-6 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col justify-center"
          >
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Pre-paid orders. Verified by UPI.
            </div>
            <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
              Skip the queue. <br />
              <span className="text-gradient-spice">Eat sooner.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Order from {restaurant?.name ?? "Spice Junction"}, pay instantly with PhonePe UPI, and walk in with your 4-digit pickup code. That's it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="rounded-full bg-gradient-spice px-7 text-base font-semibold text-primary-foreground shadow-glow hover:opacity-90"
                onClick={() => navigate({ to: "/menu" })}
              >
                Order now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-border/60 bg-card/50 px-7 text-base hover:bg-card"
                onClick={() => navigate({ to: "/become-merchant" })}
              >
                For restaurants
              </Button>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4">
              {[
                { icon: ShieldCheck, label: "100% pre-paid", desc: "PhonePe verified" },
                { icon: Clock, label: "~15 min", desc: "Avg. ready time" },
                { icon: Smartphone, label: "UPI Intent", desc: "One-tap pay" },
              ].map((f) => (
                <div key={f.label} className="rounded-2xl border border-border/40 bg-card/40 p-3 backdrop-blur">
                  <f.icon className="h-5 w-5 text-primary" />
                  <div className="mt-2 text-sm font-semibold">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative"
          >
            <div className="absolute -inset-6 rounded-[3rem] bg-gradient-spice opacity-20 blur-3xl" aria-hidden />
            <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-border/50 shadow-elegant">
              <img
                src={heroImage}
                alt="Royal Indian thali with butter chicken, biryani, naan and raita"
                className="h-full w-full object-cover"
                width={1600}
                height={1200}
              />
              <div className="absolute inset-0 bg-overlay-fade" />
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-primary/90">Featured</div>
                  <div className="font-display text-2xl font-bold">Royal Thali</div>
                </div>
                <div className="rounded-full bg-background/80 px-3 py-1.5 text-sm font-bold text-primary backdrop-blur">
                  {formatINR(420)}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured grid */}
      <section className="mx-auto max-w-7xl px-4 pb-20 md:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold md:text-4xl">Tonight's picks</h2>
            <p className="mt-1 text-sm text-muted-foreground">Hand-selected from our kitchen.</p>
          </div>
          <Link
            to="/menu"
            className="hidden items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80 md:inline-flex"
          >
            View full menu <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-card" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {featured.map((item, i) => (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card-gradient shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant"
              >
                <div className="relative aspect-square overflow-hidden">
                  <img
                    src={resolveDishImage(item.image_url)}
                    alt={item.name}
                    loading="lazy"
                    width={800}
                    height={800}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-overlay-fade" />
                  {item.is_featured && (
                    <div className="absolute left-3 top-3 rounded-full bg-gradient-spice px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                      Chef's pick
                    </div>
                  )}
                  <div className="absolute right-3 top-3">
                    <DietBadge diet={item.diet} size={18} />
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-1 font-semibold">{item.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display text-lg font-bold">{formatINR(Number(item.price))}</span>
                    <Button
                      size="sm"
                      className="rounded-full bg-gradient-spice text-xs font-semibold text-primary-foreground hover:opacity-90"
                      onClick={() => handleAddToCart(item)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border/40 bg-card/30 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground md:px-6">
          QuickServe · Built for India · Powered by UPI
        </div>
      </footer>
    </div>
  );
}
