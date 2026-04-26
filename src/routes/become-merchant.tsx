import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ChefHat, Sparkles, ArrowRight, ArrowLeft, Upload, CheckCircle2, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { StorefrontHeader } from "@/components/StorefrontHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validateVpa } from "@/lib/upi";
import { toast } from "sonner";

export const Route = createFileRoute("/become-merchant")({
  head: () => ({
    meta: [
      { title: "List your restaurant — QuickServe" },
      {
        name: "description",
        content: "Open your restaurant on QuickServe in minutes. Receive UPI payments directly to your bank.",
      },
    ],
  }),
  component: BecomeMerchantPage,
});

const step1Schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  tagline: z.string().trim().max(160).optional(),
  cuisine: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  address: z.string().trim().max(255).optional(),
});

const step3Schema = z.object({
  upiVpa: z.string().trim().refine(validateVpa, "Enter a valid UPI ID like shop@okicici"),
  payeeName: z.string().trim().min(2, "Payee name is required").max(100),
  gstPercentage: z.number().min(0).max(28),
  containerCharge: z.number().min(0).max(500),
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

type Step = 1 | 2 | 3;

function BecomeMerchantPage() {
  const { user, isMerchant, refreshRoles, loading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  // Step 2
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Step 3
  const [upiVpa, setUpiVpa] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [gstPercentage, setGstPercentage] = useState(5);
  const [containerCharge, setContainerCharge] = useState(0);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/become-merchant" } });
      return;
    }
    if (isMerchant) navigate({ to: "/merchant" });
  }, [user, isMerchant, loading, navigate]);

  // Default payee name to restaurant name
  useEffect(() => {
    if (!payeeName && name) setPayeeName(name);
  }, [name, payeeName]);

  const handleFile = (which: "logo" | "cover") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image must be under 3 MB");
      return;
    }
    const url = URL.createObjectURL(file);
    if (which === "logo") {
      setLogoFile(file);
      setLogoPreview(url);
    } else {
      setCoverFile(file);
      setCoverPreview(url);
    }
  };

  const goNext = () => {
    if (step === 1) {
      const parsed = step1Schema.safeParse({ name, tagline, cuisine, city, address });
      if (!parsed.success) return toast.error(parsed.error.issues[0].message);
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const submit = async () => {
    if (!user) return;
    const parsed = step3Schema.safeParse({ upiVpa, payeeName, gstPercentage, containerCharge });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setBusy(true);

    // 1. Grant merchant role
    const { error: roleErr } = await supabase.rpc("claim_merchant_role");
    if (roleErr) {
      toast.error(roleErr.message);
      setBusy(false);
      return;
    }
    await refreshRoles();

    // 2. Upload images (best-effort, non-blocking on fail)
    const uploadOne = async (file: File | null, kind: "logo" | "cover"): Promise<string | null> => {
      if (!file) return null;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("restaurant-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) {
        toast.error(`${kind} upload failed: ${upErr.message}`);
        return null;
      }
      const { data } = supabase.storage.from("restaurant-assets").getPublicUrl(path);
      return data.publicUrl;
    };

    const [logoUrl, coverUrl] = await Promise.all([uploadOne(logoFile, "logo"), uploadOne(coverFile, "cover")]);

    // 3. Create restaurant
    const slug = slugify(name) || `restaurant-${Date.now()}`;
    const { error: rErr } = await supabase.from("restaurants").insert({
      owner_id: user.id,
      name,
      slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      tagline: tagline || null,
      cuisine: cuisine || null,
      address: address || null,
      city: city || null,
      logo_url: logoUrl,
      cover_image_url: coverUrl,
      upi_vpa: upiVpa.trim(),
      payee_name: payeeName.trim(),
      payment_mode: "upi_intent",
      gst_percentage: gstPercentage,
      container_charge: containerCharge,
      is_active: true,
    });

    setBusy(false);
    if (rErr) {
      toast.error(rErr.message);
      return;
    }
    toast.success("Restaurant live!");
    navigate({ to: "/merchant" });
  };

  return (
    <div className="min-h-screen bg-background">
      <StorefrontHeader />
      <div className="mx-auto max-w-2xl px-4 py-12 md:px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            For restaurant owners
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold md:text-5xl">List your restaurant</h1>
          <p className="mt-2 text-muted-foreground">
            Pre-paid orders. UPI settles directly into <strong>your</strong> bank account. No middlemen.
          </p>

          <Stepper step={step} />

          <div className="mt-6 rounded-3xl border border-border/50 bg-card-gradient p-6 shadow-elegant md:p-8">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="s1"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="space-y-4"
                >
                  <h2 className="font-display text-xl font-bold">About your restaurant</h2>
                  <Field label="Restaurant name *" htmlFor="rname">
                    <Input id="rname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spice Junction" className="bg-input/50" />
                  </Field>
                  <Field label="Tagline" htmlFor="rtag">
                    <Input id="rtag" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Bengaluru's best biryani" className="bg-input/50" />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Cuisine" htmlFor="rcui">
                      <Input id="rcui" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="South Indian, Chinese" className="bg-input/50" />
                    </Field>
                    <Field label="City" htmlFor="rcity">
                      <Input id="rcity" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" className="bg-input/50" />
                    </Field>
                  </div>
                  <Field label="Address" htmlFor="raddr">
                    <Textarea id="raddr" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Shop #4, MG Road" className="bg-input/50" />
                  </Field>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="s2"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="space-y-5"
                >
                  <h2 className="font-display text-xl font-bold">Branding</h2>
                  <p className="text-sm text-muted-foreground">Optional. You can edit these later.</p>
                  <UploadField label="Logo" preview={logoPreview} onChange={handleFile("logo")} hint="Square, ≤ 3 MB" />
                  <UploadField label="Cover image" preview={coverPreview} onChange={handleFile("cover")} hint="Wide banner, ≤ 3 MB" tall />
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="s3"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="space-y-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-primary" />
                      <h2 className="font-display text-xl font-bold">Payments &amp; taxes</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Money goes directly to your UPI-linked bank — QuickServe never touches it.
                    </p>
                  </div>

                  <Field label="Your UPI ID *" htmlFor="rvpa" hint="e.g. yourshop@okicici, 98xxxxxxx@ybl">
                    <Input
                      id="rvpa"
                      value={upiVpa}
                      onChange={(e) => setUpiVpa(e.target.value)}
                      placeholder="yourshop@okicici"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="bg-input/50 font-mono"
                    />
                  </Field>
                  <Field label="Payee name *" htmlFor="rpayee" hint="Shows on the customer's UPI app">
                    <Input id="rpayee" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} className="bg-input/50" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="GST %" htmlFor="rgst">
                      <Input
                        id="rgst"
                        type="number"
                        min={0}
                        max={28}
                        step="0.5"
                        value={gstPercentage}
                        onChange={(e) => setGstPercentage(Number(e.target.value))}
                        className="bg-input/50"
                      />
                    </Field>
                    <Field label="Container charge ₹" htmlFor="rcc">
                      <Input
                        id="rcc"
                        type="number"
                        min={0}
                        max={500}
                        step="1"
                        value={containerCharge}
                        onChange={(e) => setContainerCharge(Number(e.target.value))}
                        className="bg-input/50"
                      />
                    </Field>
                  </div>

                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
                    <div className="flex items-center gap-2 font-semibold text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      How it works
                    </div>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                      <li>Customer taps "Pay" — their UPI app opens with your details pre-filled.</li>
                      <li>You receive an instant credit SMS from your bank.</li>
                      <li>Tap "Confirm received" on the order in your dashboard. The kitchen ticket prints.</li>
                    </ol>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6 flex items-center justify-between gap-3">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)} className="rounded-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              ) : (
                <span />
              )}

              {step < 3 ? (
                <Button onClick={goNext} className="rounded-full bg-gradient-spice text-primary-foreground shadow-glow hover:opacity-90">
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={submit}
                  disabled={busy}
                  size="lg"
                  className="rounded-full bg-gradient-spice text-base font-semibold text-primary-foreground shadow-glow hover:opacity-90"
                >
                  <ChefHat className="mr-2 h-4 w-4" />
                  {busy ? "Creating..." : "Launch restaurant"}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Restaurant", "Branding", "Payments"];
  return (
    <div className="mt-6 flex items-center gap-2">
      {labels.map((l, i) => {
        const idx = (i + 1) as Step;
        const active = step >= idx;
        return (
          <div key={l} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                active ? "bg-gradient-spice text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {idx}
            </div>
            <span className={`text-xs font-semibold uppercase tracking-wider ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {l}
            </span>
            {i < labels.length - 1 && <div className={`h-px flex-1 ${active ? "bg-primary/40" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function UploadField({
  label,
  preview,
  onChange,
  hint,
  tall,
}: {
  label: string;
  preview: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
  tall?: boolean;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <label
        className={`flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-input/30 transition-colors hover:border-primary/40 ${
          tall ? "h-40" : "h-28"
        }`}
      >
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <Upload className="h-5 w-5" />
            <span>Click to upload</span>
            {hint && <span className="text-[11px]">{hint}</span>}
          </div>
        )}
        <input type="file" accept="image/*" onChange={onChange} className="hidden" />
      </label>
    </div>
  );
}
