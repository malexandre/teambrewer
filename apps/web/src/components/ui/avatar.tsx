import type { ComponentProps } from "react";

import { initialsFor } from "@/lib/initials";
import { cn } from "@/lib/utils";

const AVATAR_SIZE_CLASSES = {
  sm: "size-6 text-[0.65rem]",
  default: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

type AvatarSize = keyof typeof AVATAR_SIZE_CLASSES;

/**
 * A member's initials avatar — a filled circle with the first/last-word initials of the
 * display name. Decorative (the name is always shown alongside), so it is `aria-hidden`
 * with the full name on `title` for a mouse hover. The single reusable member glyph.
 */
export function Avatar({
  name,
  size = "default",
  className,
  ...props
}: {
  name: string;
  size?: AvatarSize;
} & Omit<ComponentProps<"span">, "children">) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground",
        AVATAR_SIZE_CLASSES[size],
        className,
      )}
      title={name}
      aria-hidden="true"
      {...props}
    >
      {initialsFor(name)}
    </span>
  );
}
