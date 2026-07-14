import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A minimal modal dialog: a full-screen scrim over a centered panel, rendered
 * through a portal so it escapes any transformed/overflow-clipped ancestor. It
 * follows the app's existing overlay pattern (the mobile drawer in AppChrome):
 * `role="dialog"` + `aria-modal`, a backdrop button that closes on click, and
 * Escape-to-close. No new dependency — `createPortal` ships with react-dom.
 *
 * Rendering is gated on `open` so the dialog is fully unmounted (and its form
 * state reset) when closed.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="fixed inset-0 bg-foreground/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex w-full max-w-lg flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
