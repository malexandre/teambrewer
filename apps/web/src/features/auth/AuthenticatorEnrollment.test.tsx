import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthenticatorEnrollment } from "./AuthenticatorEnrollment";

const TOTP_URI =
  "otpauth://totp/TeamBrewer:alice?secret=JBSWY3DPEHPK3PXP&issuer=TeamBrewer&algorithm=SHA1&digits=6&period=30";
const SECRET = "JBSWY3DPEHPK3PXP";

describe("AuthenticatorEnrollment", () => {
  it("renders a QR code for the otpauth URI alongside the manual key", () => {
    render(<AuthenticatorEnrollment totpUri={TOTP_URI} secret={SECRET} />);

    // The QR is rendered as an SVG inside the labelled container.
    const qr = screen.getByTestId("totp-qr").querySelector("svg");
    expect(qr).not.toBeNull();

    // The manual key remains available as a fallback.
    expect(screen.getByTestId("totp-secret")).toHaveTextContent(SECRET);

    // The deep link opens the authenticator directly.
    expect(screen.getByRole("link", { name: /authenticator app/i })).toHaveAttribute(
      "href",
      TOTP_URI,
    );
  });
});
