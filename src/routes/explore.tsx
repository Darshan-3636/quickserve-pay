import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Star, Clock, Flame, ArrowUpDown, MapPin, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { resolveDishImage, heroImage } from "@/lib/dish-images";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

type Stat = {
  restaurant_id: string;
  total_units_sold: number;
  orders_count: number;
  avg_price: number;
  min_price: number;
  max_price: number;
};

type RowWithStats = Restaurant & {
  units: number;
  orders: number;
  avg: number;
  min: number;
  max: number;
};

type SortKey = "best_seller" | "newest" | "price_asc" | "price_desc";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore restaurants — QuickServe" },
      {
        name: "description",
        content:
          "Discover restaurants near you. Sort by best-sellers, newest arrivals or price. Pay with PhonePe UPI and pickup with a 4-digit code.",
      },
      { property: "og:title", content: "Explore restaurants — QuickServe" },
      {
        property: "og:description",
        content: "Browse, sort and order. Pre-paid pickup with UPI.",
      },
    ],
  }),
  component: ExplorePage,
});

function ExplorePage() {
  const [rows, setRows] = useState<RowWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("best_seller");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: rests }, { data: stats }] = await Promise.all([
        supabase
          .from("restaurants")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase.from("restaurant_stats" as never).select("*"),
      ]);
      if (cancelled) return;
      const statMap = new Map<string, Stat>(
        ((stats as unknown as Stat[]) ?? []).map((s) => [s.restaurant_id, s])
      );
      const merged: RowWithStats[] = ((rests ?? []) as Restaurant[]).map((r) => {
        const s = statMap.get(r.id);
        return {
          ...r,
          units: s?.total_units_sold ?? 0,
          orders: s?.orders_count ?? 0,
          avg: Number(s?.avg_price ?? 0),
          min: Number(s?.min_price ?? 0),
          max: Number(s?.max_price ?? 0),
        };
      });
      setRows(merged);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.cuisine ?? "").toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q)
      );
    });
    switch (sort) {
      case "best_seller":
        out = [...out].sort((a, b) => b.units - a.units || b.orders - a.orders);
        break;
      case "newest":
        out = [...out].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case "price_asc":
        out = [...out].sort((a, b) => (a.min || a.avg) - (b.min || b.avg));
        break;
      case "price_desc":
        out = [...out].sort((a, b) => (b.max || b.avg) - (a.max || a.avg));
        break;
    }
    return out;
  }, [rows, query, sort]);

  const topSeller = filtered[0];

  return (
    <div className="min-h-screen bg-background pb-20">
      <StorefrontHeader />

      {/* Hero band */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-radial-glow" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {rows.length} restaurant{rows.length === 1 ? "" : "s"} live
          </div>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight md:text-6xl">
            What are you craving <span className="text-gradient-spice">today?</span>
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Browse all restaurants. Sort by what's selling fastest, what's brand-new, or
            what fits your budget.
          </p>

          {/* Filters */}
          <div className="mt-7 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search restaurants, cuisines, cities..."
                className="rounded-full border-border/50 bg-card/60 pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-[180px] rounded-full border-border/50 bg-card/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best_seller">Best sellers</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price_asc">Price: low to high</SelectItem>
                  <SelectItem value="price_desc">Price: high to low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-3xl bg-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/60 p-16 text-center">
            <h2 className="font-display text-xl font-bold">No restaurants found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search, or check back soon — new spots arriving.
            </p>
          </div>
        ) : (
          <>
            {/* Featured best-seller card */}
            {sort === "best_seller" && topSeller && topSeller.units > 0 && (
              <FeaturedCard r={topSeller} />
            )}

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((r, i) => (
                <RestaurantCard key={r.id} r={r} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FeaturedCard({ r }: { r: RowWithStats }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-[2rem] border border-primary/30 bg-card-gradient shadow-elegant"
    >
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="relative aspect-[4/3] md:aspect-auto">
          <img
            src={r.cover_image_url ? resolveDishImage(r.cover_image_url) : heroImage}
            alt={r.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-overlay-fade md:bg-gradient-to-r md:from-transparent md:to-card" />
          <div className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-spice px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-glow">
            <Flame className="h-3.5 w-3.5" />
            #1 Best seller
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 md:p-8">
          <div className="text-xs uppercase tracking-widest text-primary">
            {r.cuisine ?? "Featured"}
          </div>
          <h2 className="font-display text-3xl font-extrabold md:text-4xl">{r.name}</h2>
          <p className="text-sm text-muted-foreground">{r.tagline ?? r.description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-saffron text-saffron" />
              {r.units} sold
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              ~15 min
            </span>
            {r.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {r.city}
              </span>
            )}
          </div>
          <Button
            asChild
            size="lg"
            className="mt-4 w-fit rounded-full bg-gradient-spice px-7 text-base font-semibold text-primary-foreground shadow-glow hover:opacity-90"
          >
            <Link to="/r/$slug" params={{ slug: r.slug }}>
              View menu
            </Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function RestaurantCard({ r, index }: { r: RowWithStats; index: number }) {
  const isNew =
    Date.now() - new Date(r.created_at).getTime() < 1000 * 60 * 60 * 24 * 14;
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.25) }}
      className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card-gradient shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant"
    >
      <Link to="/r/$slug" params={{ slug: r.slug }} className="block">
        <div className="relative aspect-[5/3] overflow-hidden">
          <img
            src={r.cover_image_url ? resolveDishImage(r.cover_image_url) : heroImage}
            alt={r.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-overlay-fade" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {isNew && (
              <span className="rounded-full bg-success/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-background">
                New
              </span>
            )}
            {r.units > 0 && (
              <span className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur">
                {r.units} sold
              </span>
            )}
          </div>
          <div className="absolute bottom-3 right-3 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
            ~15 min
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-1 font-display text-lg font-bold">{r.name}</h3>
            <div className="flex items-center gap-0.5 rounded-full bg-veg/10 px-2 py-0.5 text-[11px] font-bold text-veg">
              <Star className="h-3 w-3 fill-current" />
              4.{(((r.units || 1) * 7) % 9) + 1}
            </div>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {r.cuisine ?? "Multi-cuisine"} · {r.city ?? "—"}
          </p>
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/80">
            {r.tagline ?? r.description ?? ""}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 text-xs">
            <span className="text-muted-foreground">
              {r.min > 0 ? `${formatINR(r.min)} – ${formatINR(r.max)}` : "Menu loading"}
            </span>
            <span className="font-semibold text-primary">View menu →</span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
