import { createFileRoute, useNavigate, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Leaf, MapPin, Clock, Star, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { DietBadge } from "@/components/DietBadge";
import { resolveDishImage, heroImage } from "@/lib/dish-images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { cartStore, useCart } from "@/lib/cart-store";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type Category = Database["public"]["Tables"]["menu_categories"]["Row"];

export const Route = createFileRoute("/r/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} — QuickServe` },
      {
        name: "description",
        content:
          "Browse this restaurant's menu, pay with PhonePe UPI and pickup with a 4-digit code.",
      },
    ],
  }),
  component: RestaurantPage,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <StorefrontHeader />
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold">Restaurant not found</h1>
        <Button asChild className="mt-5 rounded-full">
          <Link to="/explore">Browse all restaurants</Link>
        </Button>
      </div>
    </div>
  ),
});

function RestaurantPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [vegOnly, setVegOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const { itemCount, subtotal } = useCart();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: rest } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (!rest) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }
      setRestaurant(rest);
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
  }, [slug]);

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

  if (notFoundFlag) {
    throw notFound();
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <StorefrontHeader />

      {/* Restaurant header */}
      <section className="relative overflow-hidden">
        <div className="relative h-56 w-full md:h-72">
          <img
            src={
              restaurant?.cover_image_url
                ? resolveDishImage(restaurant.cover_image_url)
                : heroImage
            }
            alt={restaurant?.name ?? "Restaurant"}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <Link
            to="/explore"
            className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-background"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All restaurants
          </Link>
        </div>
        <div className="mx-auto -mt-12 max-w-7xl px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-border/50 bg-card-gradient p-5 shadow-elegant md:p-7"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="font-display text-3xl font-extrabold md:text-4xl">
                  {restaurant?.name ?? "—"}
                </h1>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  {restaurant?.tagline ?? restaurant?.description ?? ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {restaurant?.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {restaurant.city}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  ~15 min
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-veg/10 px-2 py-0.5 font-bold text-veg">
                  <Star className="h-3 w-3 fill-current" />
                  4.5
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        {/* Filters */}
        <div className="sticky top-16 z-30 -mx-4 border-y border-border/50 bg-background/85 px-4 py-3 backdrop-blur md:mx-0 md:rounded-2xl md:border md:px-4">
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

          {categories.length > 0 && (
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
          )}
        </div>

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
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="font-display text-lg font-bold">
                      {formatINR(Number(item.price))}
                    </span>
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
          <div className="mt-12 text-center text-muted-foreground">
            No dishes available right now.
          </div>
        )}
      </div>

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
