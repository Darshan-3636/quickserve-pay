import type { Database } from "@/integrations/supabase/types";

type Diet = Database["public"]["Enums"]["diet_type"];

const DIET_CONFIG: Record<Diet, { color: string; label: string }> = {
  veg: { color: "var(--veg)", label: "Vegetarian" },
  non_veg: { color: "var(--non-veg)", label: "Non-Veg" },
  egg: { color: "var(--egg)", label: "Contains Egg" },
};

export function DietBadge({ diet, size = 14 }: { diet: Diet; size?: number }) {
  const cfg = DIET_CONFIG[diet];
  return (
    <span
      className="inline-flex items-center justify-center rounded-[3px] border-[1.5px] bg-background/60 p-[2px]"
      style={{ borderColor: cfg.color, width: size, height: size }}
      aria-label={cfg.label}
      title={cfg.label}
    >
      <span
        className="rounded-full"
        style={{
          backgroundColor: cfg.color,
          width: size / 2.2,
          height: size / 2.2,
        }}
      />
    </span>
  );
}
