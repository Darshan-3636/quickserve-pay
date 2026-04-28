import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { ChefHat } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional().default("/merchant") });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Merchant login — QuickServe" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("ds3590778@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    setTimeout(() => navigate({ to: search.redirect }), 0);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back!");
    navigate({ to: search.redirect });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="absolute inset-0 bg-radial-glow" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-spice shadow-glow">
            <ChefHat className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">
            Quick<span className="text-gradient-spice">Serve</span>
          </span>
        </Link>

        <div className="rounded-3xl border border-border/50 bg-card-gradient p-6 shadow-elegant md:p-8">
          <h1 className="text-center font-display text-2xl font-bold">Merchant login</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Restaurant staff only.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="em">Email</Label>
              <Input id="em" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className="bg-input/50" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className="bg-input/50" />
            </div>
            <Button type="submit" disabled={busy}
              className="w-full rounded-full bg-gradient-spice text-primary-foreground shadow-glow hover:opacity-90">
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
