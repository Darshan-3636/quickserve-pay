import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Receipt, IndianRupee, Clock, ChefHat } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { formatINRDecimal } from "@/lib/format";

export const Route = createFileRoute("/merchant/")({
  component: MerchantHome,
});

function MerchantHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ today: 0, revenue: 0, active: 0, ready: 0 });

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: rest } = await supabase.from("restaurants").select("id, name").eq("owner_id", user.id).maybeSingle();
      if (!rest) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: orders } = await supabase
        .from("orders")
        .select("status, total, created_at, payment_status")
        .eq("restaurant_id", rest.id)
        .gte("created_at", today.toISOString());
      const paid = (orders ?? []).filter((o) => o.payment_status === "success");
      setStats({
        today: paid.length,
        revenue: paid.reduce((s, o) => s + Number(o.total), 0),
        active: (orders ?? []).filter((o) => o.status === "received" || o.status === "preparing").length,
        ready: (orders ?? []).filter((o) => o.status === "ready").length,
      });
    })();
  }, [user]);

  const cards = [
    { label: "Orders today", value: stats.today.toString(), icon: Receipt },
    { label: "Revenue today", value: formatINRDecimal(stats.revenue), icon: IndianRupee },
    { label: "Active", value: stats.active.toString(), icon: ChefHat },
    { label: "Ready for pickup", value: stats.ready.toString(), icon: Clock },
  ];

  return (
    <div className="p-6 md:p-8">
      <h1 className="font-display text-3xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Today's performance at a glance.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">{c.label}</span>
            </div>
            <div className="mt-3 font-display text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold">Welcome 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your menu, mark items in or out of stock, and process orders as they come in.
        </p>
      </div>
    </div>
  );
}
