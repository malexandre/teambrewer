/**
 * Flesh and Blood pitch colors (red 1 / yellow 2 / blue 3). Kept in the cards
 * feature (a display concern), not in shared/core — pitch is a generic integer
 * in the contract. Returns null when the card has no pitch or an unknown value.
 */
export function pitchColorLabel(pitch: number | null): string | null {
  switch (pitch) {
    case 1:
      return "Red";
    case 2:
      return "Yellow";
    case 3:
      return "Blue";
    default:
      return null;
  }
}

/** A compact display of a card's pitch, e.g. "pitch 1 (Red)", or null when absent. */
export function pitchDisplay(pitch: number | null): string | null {
  if (pitch === null) {
    return null;
  }
  const color = pitchColorLabel(pitch);
  return color ? `pitch ${pitch} (${color})` : `pitch ${pitch}`;
}
