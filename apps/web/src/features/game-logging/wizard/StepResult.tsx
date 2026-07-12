import type { BestOf, GameSide } from "@teambrewer/shared";

import { Input } from "@/components/ui/input";

import { SegmentedControl } from "./SegmentedControl";

/** Step 2 — the result: who went first, the best-of, and the outcome. */
export function StepResult({
  firstPlayerSide,
  setFirstPlayerSide,
  bestOf,
  changeBestOf,
  gamesWonA,
  setGamesWonA,
  gamesWonB,
  setGamesWonB,
  setSingleGameOutcome,
}: {
  firstPlayerSide: GameSide;
  setFirstPlayerSide: (side: GameSide) => void;
  bestOf: BestOf;
  changeBestOf: (next: BestOf) => void;
  gamesWonA: number;
  setGamesWonA: (games: number) => void;
  gamesWonB: number;
  setGamesWonB: (games: number) => void;
  setSingleGameOutcome: (outcome: "win" | "loss" | "draw") => void;
}) {
  const winThreshold = Math.ceil(bestOf / 2);
  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl<GameSide>
        label="Who went first?"
        value={firstPlayerSide}
        options={[
          { value: "A", label: "Me" },
          { value: "B", label: "Opponent" },
        ]}
        onChange={setFirstPlayerSide}
      />

      <SegmentedControl<string>
        label="Best of"
        value={String(bestOf)}
        options={[
          { value: "1", label: "Single game" },
          { value: "3", label: "Best of 3" },
          { value: "5", label: "Best of 5" },
        ]}
        onChange={(next) => changeBestOf(Number(next) as BestOf)}
      />

      {bestOf === 1 ? (
        <SegmentedControl<string>
          label="Result"
          value={gamesWonA > gamesWonB ? "win" : gamesWonA < gamesWonB ? "loss" : "draw"}
          options={[
            { value: "win", label: "Win" },
            { value: "loss", label: "Loss" },
            { value: "draw", label: "Draw" },
          ]}
          onChange={(next) => setSingleGameOutcome(next as "win" | "loss" | "draw")}
        />
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">Games won</legend>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              You
              <Input
                type="number"
                className="w-20"
                min={0}
                max={winThreshold}
                value={gamesWonA}
                onChange={(event) => setGamesWonA(Number(event.target.value))}
                aria-label="Games you won"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              Them
              <Input
                type="number"
                className="w-20"
                min={0}
                max={winThreshold}
                value={gamesWonB}
                onChange={(event) => setGamesWonB(Number(event.target.value))}
                aria-label="Games they won"
              />
            </label>
          </div>
        </fieldset>
      )}
    </div>
  );
}
