import type { CardSummary } from "@teambrewer/shared";

import { CardPreview } from "./CardPreview";

interface CardChipProps {
  /**
   * The resolved card, or `undefined` when its id could not be resolved
   * (unknown or since-deleted). An unresolved chip renders a graceful
   * `+[unknown card]` fallback rather than crashing.
   */
  card: CardSummary | undefined;
}

/**
 * An inline `+card` chip: the card's name prefixed with `+`, wrapping the
 * existing {@link CardPreview} so hover (desktop) / press (mobile) reveals the
 * card image. Rendered by {@link CardRichText} for each `+[[cardId]]` token.
 */
export function CardChip({ card }: CardChipProps) {
  if (!card) {
    return <span className="text-muted-foreground">+[unknown card]</span>;
  }
  return (
    <span className="font-medium text-primary">
      <CardPreview card={card}>+{card.name}</CardPreview>
    </span>
  );
}
