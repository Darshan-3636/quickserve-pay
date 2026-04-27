import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, ImagePlus, Loader2 } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DietBadge } from "@/components/DietBadge";
import { resolveDishImage } from "@/lib/dish-images";
import { formatINRDecimal } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Item = Database["public"]["Tables"]["menu_items"]["Row"];
type Cat = Database["public"]["Tables"]["menu_categories"]["Row"];

export const Route = createFileRoute("/merchant/menu")({
  component: MerchantMenu,
});

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional(),
  price: z.number().nonnegative("Price must be positive").max(100000),
  prep_time_minutes: z.number().int().min(1, "At least 1 min").max(180),
  diet: z.enum(["veg", "non_veg", "egg"]),
  category_id: z.string().uuid().optional().nullable(),
  image_url: z.string().max(2048).optional().nullable(),
});

function MerchantMenu() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantLoaded, setRestaurantLoaded] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = async (rid: string) => {
    const [{ data: its }, { data: cs }] = await Promise.all([
      supabase.from("menu_items").select("*").eq("restaurant_id", rid).order("sort_order"),
      supabase.from("menu_categories").select("*").eq("restaurant_id", rid).order("sort_order"),
    ]);
    setItems((its ?? []) as Item[]);
    setCats((cs ?? []) as Cat[]);
  };

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: rest } = await supabase
        .from("restaurants")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      setRestaurantLoaded(true);
      if (!rest) return;
      setRestaurantId(rest.id);
      await refresh(rest.id);
    })();
  }, [user]);

  const toggleStock = async (item: Item) => {
    const { error } = await supabase
      .from("menu_items")
      .update({ is_in_stock: !item.is_in_stock })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((cur) =>
      cur.map((i) => (i.id === item.id ? { ...i, is_in_stock: !i.is_in_stock } : i))
    );
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((cur) => cur.filter((i) => i.id !== id));
    toast.success("Deleted");
  };

  if (restaurantLoaded && !restaurantId) {
    return (
      <div className="p-6 md:p-8">
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <h1 className="font-display text-2xl font-bold">Set up your restaurant first</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Before you can add menu items, we need a restaurant profile linked to your
            account.
          </p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/become-merchant">Create restaurant</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Menu</h1>
          <p className="mt-1 text-sm text-muted-foreground">{items.length} items</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full" disabled={!restaurantId}>
              <Plus className="mr-2 h-4 w-4" />
              New item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add menu item</DialogTitle>
            </DialogHeader>
            <NewItemForm
              cats={cats}
              restaurantId={restaurantId}
              onCreated={async () => {
                if (restaurantId) await refresh(restaurantId);
                setOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.id}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
          >
            <div className="flex gap-3 p-3">
              <img
                src={resolveDishImage(it.image_url)}
                alt={it.name}
                className="h-20 w-20 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <DietBadge diet={it.diet} />
                  <h3 className="truncate font-semibold">{it.name}</h3>
                </div>
                <div className="mt-1 text-sm font-bold">
                  {formatINRDecimal(Number(it.price))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {it.prep_time_minutes} min prep
                </div>
              </div>
              <button
                onClick={() => deleteItem(it.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-2">
              <span className="text-xs font-medium">
                {it.is_in_stock ? "In stock" : "Out of stock"}
              </span>
              <Switch checked={it.is_in_stock} onCheckedChange={() => toggleStock(it)} />
            </div>
          </div>
        ))}
        {items.length === 0 && restaurantId && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No items yet. Add your first dish to get started.
          </div>
        )}
      </div>
    </div>
  );
}

function NewItemForm({
  cats,
  restaurantId,
  onCreated,
}: {
  cats: Cat[];
  restaurantId: string | null;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("0");
  const [prep, setPrep] = useState("10");
  const [diet, setDiet] = useState<"veg" | "non_veg" | "egg">("veg");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restaurantId) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image too large (max 4MB)");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `menu/${restaurantId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("restaurant-assets")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) {
      setUploading(false);
      toast.error(`Upload failed: ${upErr.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from("restaurant-assets").getPublicUrl(path);
    setImageUrl(pub.publicUrl);
    setImagePreview(pub.publicUrl);
    setUploading(false);
    toast.success("Photo uploaded");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) {
      toast.error("Restaurant not loaded yet — please refresh.");
      return;
    }
    const parsed = itemSchema.safeParse({
      name,
      description: desc || undefined,
      price: Number(price),
      prep_time_minutes: Number(prep),
      diet,
      category_id: categoryId === "none" ? null : categoryId,
      image_url: imageUrl,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("menu_items").insert({
      restaurant_id: restaurantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price: parsed.data.price,
      prep_time_minutes: parsed.data.prep_time_minutes,
      diet: parsed.data.diet,
      category_id: parsed.data.category_id ?? null,
      image_url: parsed.data.image_url ?? null,
      is_in_stock: true,
    });
    setBusy(false);
    if (error) {
      console.error("menu_items insert failed:", error);
      toast.error(error.message || "Could not add item");
      return;
    }
    toast.success("Item added");
    void onCreated();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Image picker */}
      <div className="space-y-1.5">
        <Label>Photo (optional)</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImagePick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm transition-colors hover:bg-muted/50 disabled:opacity-60"
        >
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="h-16 w-16 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ImagePlus className="h-5 w-5" />
            </div>
          )}
          <div className="flex-1 text-left">
            <div className="font-medium">
              {uploading
                ? "Uploading..."
                : imageUrl
                ? "Replace photo"
                : "Upload a dish photo"}
            </div>
            <div className="text-xs text-muted-foreground">JPG / PNG, up to 4MB</div>
          </div>
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>

      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Paneer Butter Masala"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          placeholder="Briefly describe the dish (optional)"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label>Price (₹)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Prep (min)</Label>
          <Input
            type="number"
            min="1"
            value={prep}
            onChange={(e) => setPrep(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Diet</Label>
          <Select value={diet} onValueChange={(v) => setDiet(v as "veg" | "non_veg" | "egg")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="veg">Veg</SelectItem>
              <SelectItem value="non_veg">Non-Veg</SelectItem>
              <SelectItem value="egg">Egg</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {cats.length > 0 && (
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button type="submit" disabled={busy || uploading} className="w-full rounded-full">
        {busy ? "Saving..." : "Add item"}
      </Button>
    </form>
  );
}
