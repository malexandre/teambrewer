import { useHeroes } from "@/features/cards/use-heroes";

import { SELECT_CLASS } from "./deck-display";

/**
 * Native hero/identity picker drawn from the active game's reference data
 * (GET /api/heroes). The hero is optional, so an explicit "no hero" option maps
 * to the empty value.
 */
export function HeroPicker({
  teamId,
  value,
  onChange,
  id,
}: {
  teamId: string | undefined;
  value: string;
  onChange: (heroId: string) => void;
  id?: string;
}) {
  const { data } = useHeroes(teamId);
  const heroes = data?.data ?? [];
  return (
    <select
      id={id}
      className={SELECT_CLASS}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Hero"
    >
      <option value="">— No hero —</option>
      {heroes.map((hero) => (
        <option key={hero.id} value={hero.id}>
          {hero.name}
        </option>
      ))}
    </select>
  );
}
