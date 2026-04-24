import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Leaf } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { DietBadge } from "@/components/DietBadge";
import { resolveDishImage } from "@/lib/dish-images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { cartStore, useCart } from "@/lib/cart-store";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type Category = Database["public"]["Tables"]["menu_categories"]["Row"];

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Spice Junction · QuickServe" },
      {
        name: "description",
        content: "Browse our full menu. Pay with PhonePe UPI and pickup with a 4-digit code.",
      },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [vegOnly, setVegOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { itemCount, subtotal } = useCart();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: rest } = await supabase
        .from("restaurants")
        .select("id")
        .eq("slug", "spice-junction")
        .maybeSingle();
      if (!rest) {
        setLoading(false);
        return;
      }
      const [{ data: cats }, { data: its }] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("*")
          .eq("restaurant_id", rest.id)
          .order("sort_order"),
        supabase
          .from("menu_items")
          .select("*")
          .eq("restaurant_id", rest.id)
          .order("sort_order"),
      ]);
      if (cancelled) return;
      setCategories((cats ?? []) as Category[]);
      setItems((its ?? []) as MenuItem[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (activeCat && i.category_id !== activeCat) return false;
      if (vegOnly && i.diet !== "veg") return false;
      if (query && !i.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [items, activeCat, vegOnly, query]);

  const handleAdd = (item: MenuItem) => {
    if (!item.is_in_stock) return;
    cartStore.add(item);
    toast.success(`Added ${item.name}`, { duration: 1500 });
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <StorefrontHeader />

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <h1 className="font-display text-4xl font-bold md:text-5xl">Our Menu</h1>
        <p className="mt-1 text-muted-foreground">Tap to add. Pay with UPI at checkout.</p>

        {/* Filters */}
        <div className="sticky top-16 z-30 mt-6 -mx-4 border-y border-border/50 bg-background/85 px-4 py-3 backdrop-blur md:mx-0 md:rounded-2xl md:border md:px-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search dishes..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-full border-border/50 bg-card pl-9"
              />
            </div>
            <Button
              variant={vegOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setVegOnly((v) => !v)}
              className={
                vegOnly
                  ? "rounded-full bg-veg text-background hover:bg-veg/90"
                  : "rounded-full border-border/50"
              }
            >
              <Leaf className="mr-1.5 h-3.5 w-3.5" />
              Veg only
            </Button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <CatChip label="All" active={!activeCat} onClick={() => setActiveCat(null)} />
            {categories.map((c) => (
              <CatChip
                key={c.id}
                label={c.name}
                active={activeCat === c.id}
                onClick={() => setActiveCat(c.id)}
              />
            ))}
          </div>
        </div>

        {/* Items */}
        {loading ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-3xl bg-card" />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item, i) => (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                className="group relative flex gap-3 overflow-hidden rounded-3xl border border-border/50 bg-card-gradient p-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elegant"
              >
                <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-2xl">
                  <img
                    src={resolveDishImage(item.image_url)}
                    alt={item.name}
                    loading="lazy"
                    width={400}
                    height={400}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  {!item.is_in_stock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs font-bold uppercase">
                      Out of stock
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start gap-2">
                    <DietBadge diet={item.diet} />
                    <h3 className="font-semibold leading-tight">{item.name}</h3>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="font-display text-lg font-bold">{formatINR(Number(item.price))}</span>
                    <Button
                      size="sm"
                      disabled={!item.is_in_stock}
                      onClick={() => handleAdd(item)}
                      className="rounded-full bg-gradient-spice px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className="mt-12 text-center text-muted-foreground">No dishes match your filters.</div>
        )}
      </div>

      {/* Sticky cart bar */}
      {itemCount > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-full border border-primary/30 bg-card/95 p-2 pl-5 shadow-elegant backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-bold">{itemCount}</span>{" "}
              <span className="text-muted-foreground">items · {formatINR(subtotal)}</span>
            </div>
            <Button
              size="sm"
              onClick={() => navigate({ to: "/checkout" })}
              className="rounded-full bg-gradient-spice px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              View cart
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function CatChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-gradient-spice text-primary-foreground shadow-glow"
          : "border border-border/60 bg-card/50 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
