import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ChefHat, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/become-merchant")({
  head: () => ({ meta: [{ title: "List your restaurant — QuickServe" }] }),
  component: BecomeMerchantPage,
});

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  tagline: z.string().trim().max(160).optional(),
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function BecomeMerchantPage() {
  const { user, isMerchant, refreshRoles, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/become-merchant" } });
      return;
    }
    if (isMerchant) {
      // Already a merchant — go to dashboard
      navigate({ to: "/merchant" });
    }
  }, [user, isMerchant, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ name, tagline, address, city });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);

    // 1) Grant merchant role
    const { error: roleErr } = await supabase
      .from("user_roles")
      .insert({ user_id: user.id, role: "merchant" });
    if (roleErr && !roleErr.message.includes("duplicate")) {
      toast.error(roleErr.message);
      setBusy(false);
      return;
    }
    await refreshRoles();

    // 2) Create restaurant
    let slug = slugify(name);
    if (!slug) slug = `restaurant-${Date.now()}`;
    const { error: rErr } = await supabase.from("restaurants").insert({
      owner_id: user.id,
      name,
      slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      tagline: tagline || null,
      address: address || null,
      city: city || null,
      gst_percentage: 5,
      container_charge: 0,
      is_active: true,
    });

    setBusy(false);
    if (rErr) {
      toast.error(rErr.message);
      return;
    }
    toast.success("Restaurant created!");
    navigate({ to: "/merchant" });
  };

  return (
    <div className="min-h-screen bg-background">
      <StorefrontHeader />
      <div className="mx-auto max-w-xl px-4 py-12 md:px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            For restaurant owners
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold md:text-5xl">List your restaurant</h1>
          <p className="mt-2 text-muted-foreground">
            Get pre-paid orders. No payment chasing. Direct UPI settlement.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4 rounded-3xl border border-border/50 bg-card-gradient p-6 shadow-elegant">
            <div className="space-y-1.5">
              <Label htmlFor="rname">Restaurant name *</Label>
              <Input id="rname" value={name} onChange={(e) => setName(e.target.value)} className="bg-input/50" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rtag">Tagline</Label>
              <Input id="rtag" value={tagline} onChange={(e) => setTagline(e.target.value)} className="bg-input/50" placeholder="The best biryani in town" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="raddr">Address</Label>
                <Textarea id="raddr" value={address} onChange={(e) => setAddress(e.target.value)} className="bg-input/50" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rcity">City</Label>
                <Input id="rcity" value={city} onChange={(e) => setCity(e.target.value)} className="bg-input/50" />
              </div>
            </div>
            <Button
              type="submit"
              disabled={busy}
              size="lg"
              className="w-full rounded-full bg-gradient-spice text-base font-semibold text-primary-foreground shadow-glow hover:opacity-90"
            >
              <ChefHat className="mr-2 h-4 w-4" />
              {busy ? "Creating..." : "Create restaurant"}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
