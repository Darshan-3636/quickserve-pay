export function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatINRDecimal(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function generatePickupCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Wait time algorithm: W = (N × 3) + Pmax
 * N = active orders, Pmax = longest prep time in cart
 */
export function estimateWaitMinutes(activeOrders: number, maxPrepTime: number): number {
  return activeOrders * 3 + maxPrepTime;
}
