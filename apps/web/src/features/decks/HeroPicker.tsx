import { useHeroes } from "@/features/cards/use-heroes";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";

import { SELECT_CLASS } from "./deck-display";

/**
 * Native identity picker (the game's "Hero"/"Legend") drawn from the active
 * game's reference data (GET /api/heroes). The identity is optional, so an
 * explicit "none" option maps to the empty value. An optional `formatId` narrows
 * the choices to heroes legal in that format (used by the meta board, which is
 * scoped to a format); omitted elsewhere, it lists every hero.
 */
export function HeroPicker({
  teamId,
  value,
  onChange,
  id,
  formatId,
}: {
  teamId: string | undefined;
  value: string;
  onChange: (heroId: string) => void;
  id?: string;
  formatId?: string | undefined;
}) {
  const { data } = useHeroes(teamId, formatId);
  const identityLabel = useIdentityLabel(teamId);
  const heroes = data?.data ?? [];
  return (
    <select
      id={id}
      className={SELECT_CLASS}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={identityLabel}
    >
      <option value="">— No {identityLabel.toLowerCase()} —</option>
      {heroes.map((hero) => (
        <option key={hero.id} value={hero.id}>
          {hero.name}
        </option>
      ))}
    </select>
  );
}
