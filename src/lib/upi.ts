// Pure helpers for building UPI deep-links and validating VPAs.
// `upi://pay` is the standard URI scheme handled by GPay, PhonePe, Paytm, BHIM, etc.
// Reference: NPCI UPI Linking Specifications.

export const VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export function validateVpa(vpa: string): boolean {
  return VPA_REGEX.test(vpa.trim());
}

export interface UpiLinkParams {
  vpa: string; // payee address e.g. shop@okicici
  payeeName: string; // display name
  amount: number; // INR
  transactionRef: string; // unique tr= (used to match payment)
  transactionNote?: string; // tn= short human note (shows in SMS)
}

/**
 * Builds a `upi://pay?...` deep link.
 * On Android/iOS this opens the user's UPI app picker.
 * On desktop, encode the same string as a QR code.
 */
export function buildUpiUri(params: UpiLinkParams): string {
  const search = new URLSearchParams();
  search.set("pa", params.vpa);
  search.set("pn", params.payeeName);
  search.set("am", params.amount.toFixed(2));
  search.set("cu", "INR");
  search.set("tr", params.transactionRef);
  if (params.transactionNote) {
    // Note must be short — UPI apps truncate. Strip non ASCII alphanumerics to be safe.
    const note = params.transactionNote.replace(/[^A-Za-z0-9 \-]/g, "").slice(0, 40);
    if (note) search.set("tn", note);
  }
  // URLSearchParams encodes with `+` for spaces; UPI apps prefer `%20`.
  return `upi://pay?${search.toString().replace(/\+/g, "%20")}`;
}
