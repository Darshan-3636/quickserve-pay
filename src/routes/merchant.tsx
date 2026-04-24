import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, UtensilsCrossed, Receipt, ChefHat, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

export const Route = createFileRoute("/merchant")({
  head: () => ({ meta: [{ title: "Merchant Console — QuickServe" }, { name: "robots", content: "noindex" }] }),
  component: MerchantLayout,
});

const NAV: ReadonlyArray<{ to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }> = [
  { to: "/merchant", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/merchant/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/merchant/orders", label: "Orders", icon: Receipt },
];

function MerchantLayout() {
  const { user, isMerchant, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/merchant" } });
      return;
    }
    if (!isMerchant) {
      navigate({ to: "/become-merchant" });
      return;
    }
    void supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle()
      .then(({ data }) => setRestaurant(data));
  }, [user, isMerchant, loading, navigate]);

  if (loading || !user || !isMerchant) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="dashboard-light min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
          <Link to="/merchant" className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-spice">
              <ChefHat className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display text-base font-bold leading-none">QuickServe</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Merchant Console</div>
            </div>
          </Link>

          <div className="border-b border-sidebar-border px-5 py-4">
            <div className="text-xs text-muted-foreground">Restaurant</div>
            <div className="truncate text-sm font-bold">{restaurant?.name ?? "—"}</div>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {NAV.map((n) => {
              const active = n.exact ? location.pathname === n.to : location.pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to as any}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-x-hidden">
          {/* Mobile top nav */}
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card px-4 py-3 md:hidden">
            {NAV.map((n) => {
              const active = n.exact ? location.pathname === n.to : location.pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to as any}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
