import { useSyncExternalStore } from "react";
import type { Database } from "@/integrations/supabase/types";

export type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];

export interface CartLine {
  item: MenuItem;
  quantity: number;
}

const STORAGE_KEY = "quickserve.cart.v1";

interface CartState {
  restaurantId: string | null;
  lines: Record<string, CartLine>;
}

let state: CartState = { restaurantId: null, lines: {} };
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw) as CartState;
  } catch {
    /* ignore */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

let loaded = false;
function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    load();
    loaded = true;
  }
}

export const cartStore = {
  subscribe(listener: () => void) {
    ensureLoaded();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): CartState {
    ensureLoaded();
    return state;
  },
  getServerSnapshot(): CartState {
    return { restaurantId: null, lines: {} };
  },
  add(item: MenuItem) {
    ensureLoaded();
    if (state.restaurantId && state.restaurantId !== item.restaurant_id) {
      // Different restaurant — reset
      state = { restaurantId: item.restaurant_id, lines: {} };
    }
    if (!state.restaurantId) state.restaurantId = item.restaurant_id;
    const existing = state.lines[item.id];
    state = {
      ...state,
      lines: {
        ...state.lines,
        [item.id]: { item, quantity: existing ? existing.quantity + 1 : 1 },
      },
    };
    emit();
  },
  remove(itemId: string) {
    ensureLoaded();
    const existing = state.lines[itemId];
    if (!existing) return;
    const nextQty = existing.quantity - 1;
    const nextLines = { ...state.lines };
    if (nextQty <= 0) {
      delete nextLines[itemId];
    } else {
      nextLines[itemId] = { ...existing, quantity: nextQty };
    }
    state = {
      ...state,
      lines: nextLines,
      restaurantId: Object.keys(nextLines).length === 0 ? null : state.restaurantId,
    };
    emit();
  },
  clear() {
    state = { restaurantId: null, lines: {} };
    emit();
  },
};

export function useCart() {
  const snap = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  const lines = Object.values(snap.lines);
  const subtotal = lines.reduce((sum, l) => sum + Number(l.item.price) * l.quantity, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const maxPrep = lines.reduce((m, l) => Math.max(m, l.item.prep_time_minutes), 0);
  return { ...snap, lines, subtotal, itemCount, maxPrep };
}
