import { QRCodeSVG } from "qrcode.react";

import { Label } from "@/components/ui/label";

/**
 * The TOTP enrolment display: a scannable QR code of the `otpauth://` URI plus
 * the manual setup key as a fallback (some authenticators, or accessibility
 * needs, require typing the key). The QR sits on a solid light background so it
 * scans reliably in both light and dark themes.
 */
export function AuthenticatorEnrollment({ totpUri, secret }: { totpUri: string; secret: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Scan this QR code with your authenticator app</Label>
      <div
        data-testid="totp-qr"
        className="flex justify-center rounded-md border border-border bg-white p-3"
      >
        <QRCodeSVG
          value={totpUri}
          size={176}
          marginSize={2}
          title="TeamBrewer two-factor QR code"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Can’t scan it? Enter this key manually instead:
      </p>
      <code
        data-testid="totp-secret"
        className="break-all rounded-md border border-border bg-muted p-2 text-xs"
      >
        {secret}
      </code>
      <a
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        href={totpUri}
      >
        Open in your authenticator app
      </a>
    </div>
  );
}
