## Goal

Let restaurants sign up, configure their storefront, and receive customer payments **directly into their own bank account** via UPI — without QuickServe holding the funds. Each restaurant supplies its own UPI VPA (e.g. `restaurant@okicici`), and at checkout the customer is sent to their UPI app via a dynamically generated `upi://pay` deep-link or QR. Optional upgrade path to a full PhonePe / Razorpay PG account is preserved.

---

## How it works (plain language)

1. **Sign in** — Restaurant owner creates an account on `/auth` (already built — email + password via Supabase Auth).
2. **Become a merchant** — `/become-merchant` already grants the `merchant` role and creates a restaurant row. We extend this into a 3-step wizard that also captures **payout details** (UPI VPA + payee name + optional logo/cover/GST/container charge).
3. **Set up menu** — `/merchant/menu` (already exists) lets them add categories and dishes.
4. **Customer pays dynamically** — at checkout, the server generates a unique `upi://pay` link for that order using the **restaurant's own VPA**, with the order total + a unique transaction note (`QS_<orderId>`). The customer's UPI app (GPay / PhonePe / Paytm / BHIM) opens, money goes **directly to the restaurant**.
5. **Confirmation** — Two paths, both supported:
   - **Auto** (preferred when the merchant later upgrades): a real PG webhook flips the order to paid.
   - **Manual** (works on day one with zero PG account): the merchant taps "Mark paid" on the order in `/merchant/orders` after they see the UPI credit SMS, OR the customer uploads the UPI reference id on the success screen and the merchant verifies it.

This is the standard pattern Indian SMBs use before they qualify for a full PG account, and matches how Razorpay/PhonePe collect-style flows behave.

---

## What gets built

### 1. Multi-step onboarding wizard (`/become-merchant`)

Replace the single form with a 3-step flow (one route, internal state):

- **Step 1 — About your restaurant**: name, tagline, city, address, cuisine description.
- **Step 2 — Branding**: logo upload + cover image upload (Supabase Storage bucket `restaurant-assets`, public read, owner write).
- **Step 3 — Payments & taxes**:
  - `upi_vpa` (validated `name@handle` regex)
  - `payee_name` (the name that shows in the UPI app)
  - `gst_percentage` (default 5)
  - `container_charge` (default 0)
  - Optional toggle: "I have a PhonePe / Razorpay merchant account" → reveals fields for `phonepe_merchant_id` + secret (stored as Supabase secret per restaurant later).

Submitting the wizard:
- calls `claim_merchant_role` RPC (already exists),
- inserts the restaurant row,
- uploads images to storage and stores URLs.

A "Payments" tab is also added to the merchant console (`/merchant/payments`) so existing merchants can edit their VPA, switch payment mode, and preview the UPI link.

### 2. Database changes (one migration)

Add to `restaurants`:
- `upi_vpa text` (nullable, validated by trigger: `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`)
- `payee_name text`
- `payment_mode text` default `'upi_intent'` — one of `upi_intent` | `phonepe_pg` | `razorpay`
- `cuisine text`

Create storage bucket `restaurant-assets` (public read, RLS write only to owner).

Add to `orders`:
- `upi_reference_id text` (nullable — the 12-digit UTR the customer/merchant enters)
- `manual_verified_by uuid` (the merchant who marked it paid)

No changes to `user_roles`, `profiles`, or RLS structure beyond owner-scoped policies on the new columns/bucket.

### 3. Dynamic UPI link generation (server function)

New server function `generateUpiPayLink` in `src/lib/payments.functions.ts`:

```text
upi://pay
  ?pa=<restaurant.upi_vpa>
  &pn=<url-encoded payee_name>
  &am=<order.total>
  &cu=INR
  &tn=QS-<order.id-short>
  &tr=<merchantTransactionId>
```

`tr` is the unique transaction reference; `tn` is the human-readable note that shows on the merchant's UPI credit SMS — they can match it to the order.

A QR code for the same string is rendered client-side using a tiny pure-JS lib (`qrcode` package, Worker-safe) so desktop customers can scan with their phone.

### 4. Rebuild `/pay/$txn` as the real UPI screen

Replace the simulator with:
- **Mobile**: a big "Pay ₹XXX with UPI" button that opens `upi://pay?...` (UPI Intent — the OS shows the app picker).
- **Desktop**: the QR code + the same `upi://pay` URL as a copyable string.
- **Below**: a form for the customer to paste their **UPI reference / UTR** after paying. Submitting saves it to `orders.upi_reference_id` and flips status to `awaiting_verification`.
- A small "Already paid?" link that polls the order every 3s in case the merchant marks it paid first.

### 5. Merchant order verification (`/merchant/orders`)

Each order in `awaiting_verification` shows:
- the customer name + amount + UTR they entered,
- two buttons: **Confirm received** (sets `payment_status = success`, `status = received`, stores `manual_verified_by`) and **Reject** (sets `payment_status = failed`).

This is what makes payments work end-to-end on day one without any PG account.

### 6. Optional upgrade path (kept, not built now)

The `payment_mode = phonepe_pg` branch in `initiatePayment` is preserved so a future task can add real PhonePe Standard Checkout (`/pg/v1/pay` + signed webhook at `/api/public/phonepe-callback`) without redesigning the flow. The webhook route file already exists conceptually; the only difference at upgrade time is which branch runs.

---

## File-level changes (technical)

```text
supabase/migrations/<ts>_merchant_payouts.sql      new — columns + storage bucket + policies
src/routes/become-merchant.tsx                      rewrite — 3-step wizard
src/routes/merchant.payments.tsx                    new — edit VPA / payment mode
src/routes/merchant.tsx                             add "Payments" nav link
src/routes/merchant.orders.tsx                      add verification UI for awaiting_verification
src/routes/pay.$txn.tsx                             rewrite — UPI Intent button + QR + UTR form
src/lib/payments.functions.ts                       add generateUpiPayLink, submitUpiReference,
                                                    merchantConfirmPayment server fns
src/lib/upi.ts                                      new — buildUpiUri(), validateVpa()
src/components/UpiQrCode.tsx                        new — wraps `qrcode` lib
package.json                                        add `qrcode` (~10kb, pure JS, Worker-safe)
src/integrations/supabase/types.ts                  auto-regenerated after migration
```

No edits to `__root.tsx`, router context, or auth middleware.

---

## Trade-offs you should know about

- **UPI Intent + manual confirmation** is free and works for any restaurant with a UPI ID, but the merchant has to tap "Confirm received" once per order (or the customer enters the UTR). Most small restaurants are happy with this — it's how Dukaan / small Shopify-on-UPI stores operated for years.
- **Real PhonePe / Razorpay PG** auto-confirms via webhook but requires KYC and ~2% fees. The schema and routes are designed so this is a drop-in upgrade later, not a rewrite.
- We are **not** routing money through a QuickServe-owned account — that would make QuickServe a payment aggregator, which requires an RBI license. Each restaurant is paid directly.