import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Smartphone, Save, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { validateVpa, buildUpiUri } from "@/lib/upi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpiQrCode } from "@/components/UpiQrCode";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

export const Route = createFileRoute("/merchant/payments")({
  head: () => ({ meta: [{ title: "Payments — Merchant Console" }, { name: "robots", content: "noindex" }] }),
  component: MerchantPayments,
});

function MerchantPayments() {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [upiVpa, setUpiVpa] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [gstPercentage, setGstPercentage] = useState(5);
  const [containerCharge, setContainerCharge] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setRestaurant(data);
        setUpiVpa(data.upi_vpa ?? "");
        setPayeeName(data.payee_name ?? data.name ?? "");
        setGstPercentage(Number(data.gst_percentage));
        setContainerCharge(Number(data.container_charge));
      });
  }, [user]);

  const save = async () => {
    if (!restaurant) return;
    if (upiVpa && !validateVpa(upiVpa.trim())) {
      return toast.error("Enter a valid UPI ID like shop@okicici");
    }
    setBusy(true);
    const { error } = await supabase
      .from("restaurants")
      .update({
        upi_vpa: upiVpa.trim() || null,
        payee_name: payeeName.trim() || null,
        gst_percentage: gstPercentage,
        container_charge: containerCharge,
      })
      .eq("id", restaurant.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  };

  const previewUri =
    restaurant && validateVpa(upiVpa.trim())
      ? buildUpiUri({
          vpa: upiVpa.trim(),
          payeeName: payeeName.trim() || restaurant.name,
          amount: 100,
          transactionRef: "QS_PREVIEW",
          transactionNote: "QS-PREVIEW",
        })
      : null;

  return (
    <div className="grid gap-6 p-4 md:grid-cols-[1fr_320px] md:p-6">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Money settles directly into your UPI-linked bank account. QuickServe never holds funds.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">UPI payout details</h2>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vpa">UPI ID</Label>
              <Input
                id="vpa"
                value={upiVpa}
                onChange={(e) => setUpiVpa(e.target.value)}
                placeholder="yourshop@okicici"
                autoCapitalize="off"
                spellCheck={false}
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Find this in your UPI app under "My UPI ID" (GPay, PhonePe, Paytm, BHIM all work).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payee">Payee name</Label>
              <Input id="payee" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Shown to the customer in their UPI app.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gst">GST %</Label>
                <Input
                  id="gst"
                  type="number"
                  min={0}
                  max={28}
                  step="0.5"
                  value={gstPercentage}
                  onChange={(e) => setGstPercentage(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc">Container charge ₹</Label>
                <Input
                  id="cc"
                  type="number"
                  min={0}
                  max={500}
                  step="1"
                  value={containerCharge}
                  onChange={(e) => setContainerCharge(Number(e.target.value))}
                />
              </div>
            </div>

            <Button onClick={save} disabled={busy} className="rounded-full">
              <Save className="mr-2 h-4 w-4" />
              {busy ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display font-bold">How payments work</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Customer checks out and lands on the UPI pay screen with your VPA pre-filled.</li>
            <li>On mobile, their UPI app opens automatically. On desktop, they scan a QR.</li>
            <li>You get an instant credit SMS / app notification from your bank.</li>
            <li>
              Open <strong>Orders</strong>, find the order in <em>Awaiting verification</em>, and tap{" "}
              <strong>Confirm received</strong>. The order moves into preparation.
            </li>
          </ol>
        </div>
      </div>

      <aside className="md:sticky md:top-4 md:self-start">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">Preview QR</h3>
          <p className="mt-1 text-xs text-muted-foreground">Sample ₹100 charge — try scanning with your phone.</p>
          <div className="mt-4 flex justify-center">
            {previewUri ? (
              <UpiQrCode value={previewUri} size={200} />
            ) : (
              <div className="flex h-[200px] w-[200px] items-center justify-center rounded-2xl border border-dashed border-border text-center text-xs text-muted-foreground">
                Enter a valid UPI ID to preview
              </div>
            )}
          </div>
          {previewUri && (
            <a
              href={previewUri}
              className="mt-3 flex items-center justify-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open in UPI app
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}
