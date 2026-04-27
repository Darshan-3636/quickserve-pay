/**
 * PhonePe PG v2 sandbox client (server-only).
 *
 * Endpoints (sandbox):
 *   - OAuth token:  POST https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token
 *   - Create pay:   POST https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay
 *   - Order status: GET  https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/{merchantOrderId}/status
 *
 * Production base would be https://api.phonepe.com/apis/pg — toggled later by changing PHONEPE_ENV.
 *
 * Secrets required (configured by user):
 *   - PHONEPE_CLIENT_ID
 *   - PHONEPE_CLIENT_SECRET
 *   - PHONEPE_CLIENT_VERSION  (typically "1")
 *   - PHONEPE_MERCHANT_ID     (sandbox merchant id, e.g. PGTESTPAYUAT86)
 */

const SANDBOX_BASE = "https://api-preprod.phonepe.com/apis/pg-sandbox";

function getEnv() {
  const clientId = process.env.PHONEPE_CLIENT_ID;
  const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
  const clientVersion = process.env.PHONEPE_CLIENT_VERSION ?? "1";
  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  if (!clientId || !clientSecret || !merchantId) {
    throw new Error(
      "PhonePe credentials missing. Set PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_MERCHANT_ID."
    );
  }
  return { clientId, clientSecret, clientVersion, merchantId, base: SANDBOX_BASE };
}

// Token cache (per worker instance) — PhonePe tokens last ~30 min.
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getPhonePeAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) return cachedToken.value;

  const { clientId, clientSecret, clientVersion, base } = getEnv();
  const body = new URLSearchParams({
    client_id: clientId,
    client_version: clientVersion,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetch(`${base}/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PhonePe OAuth failed [${res.status}]: ${text}`);
  }
  const json = JSON.parse(text) as {
    access_token: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
  };
  if (!json.access_token) {
    throw new Error(`PhonePe OAuth missing access_token: ${text}`);
  }
  const expiresAt = json.expires_at
    ? json.expires_at * 1000
    : json.expires_in
    ? now + json.expires_in * 1000
    : now + 25 * 60 * 1000;
  cachedToken = { value: json.access_token, expiresAt };
  return json.access_token;
}

export interface CreatePaymentArgs {
  merchantOrderId: string;
  amountPaise: number; // in paise
  redirectUrl: string;
  message?: string;
}

export interface CreatePaymentResult {
  orderId: string; // PhonePe-issued
  state: string;
  expireAt?: number;
  redirectUrl: string;
}

export async function phonepeCreatePayment(args: CreatePaymentArgs): Promise<CreatePaymentResult> {
  const { base } = getEnv();
  const token = await getPhonePeAccessToken();

  const payload = {
    merchantOrderId: args.merchantOrderId,
    amount: args.amountPaise,
    expireAfter: 1200, // 20 min
    metaInfo: { udf1: "QuickServe" },
    paymentFlow: {
      type: "PG_CHECKOUT",
      message: args.message ?? "Order payment",
      merchantUrls: { redirectUrl: args.redirectUrl },
    },
  };

  const res = await fetch(`${base}/checkout/v2/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `O-Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PhonePe create-payment failed [${res.status}]: ${text}`);
  }
  const json = JSON.parse(text) as {
    orderId: string;
    state: string;
    expireAt?: number;
    redirectUrl: string;
  };
  return json;
}

export interface PhonePeOrderStatus {
  orderId: string;
  state: string; // PENDING | COMPLETED | FAILED
  amount: number;
  paymentDetails?: Array<{
    transactionId?: string;
    paymentMode?: string;
    state?: string;
    amount?: number;
    timestamp?: number;
  }>;
}

export async function phonepeOrderStatus(merchantOrderId: string): Promise<PhonePeOrderStatus> {
  const { base } = getEnv();
  const token = await getPhonePeAccessToken();

  const res = await fetch(
    `${base}/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=true`,
    {
      method: "GET",
      headers: { Authorization: `O-Bearer ${token}` },
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PhonePe order-status failed [${res.status}]: ${text}`);
  }
  return JSON.parse(text) as PhonePeOrderStatus;
}
