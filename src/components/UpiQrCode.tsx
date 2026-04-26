import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  value: string;
  size?: number;
  className?: string;
}

/**
 * Renders a UPI deep link as a QR code so desktop customers can scan with
 * their phone's UPI app.
 */
export function UpiQrCode({ value, size = 220, className }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0a", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`animate-pulse rounded-2xl bg-muted ${className ?? ""}`}
        aria-label="Generating QR code"
      />
    );
  }
  return (
    <img
      src={dataUrl}
      alt="Scan to pay with any UPI app"
      width={size}
      height={size}
      className={`rounded-2xl border border-border bg-white p-2 ${className ?? ""}`}
    />
  );
}
