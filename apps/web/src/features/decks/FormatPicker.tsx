import { useFormats } from "@/features/cards/use-formats";

import { SELECT_CLASS } from "./deck-display";

/** Native format picker drawn from the active game's reference data (GET /api/formats). */
export function FormatPicker({
  teamId,
  value,
  onChange,
  id,
}: {
  teamId: string | undefined;
  value: string;
  onChange: (formatId: string) => void;
  id?: string;
}) {
  const { data } = useFormats(teamId);
  const formats = data?.data ?? [];
  return (
    <select
      id={id}
      className={SELECT_CLASS}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Format"
    >
      <option value="">Select a format…</option>
      {formats.map((format) => (
        <option key={format.id} value={format.id}>
          {format.name}
        </option>
      ))}
    </select>
  );
}
