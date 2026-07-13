import {
  type CardSummary,
  type GameLogCardInput,
  type LossReason,
  lossReasonSchema,
  type MetaSummary,
  type TeamMember,
  type WinType,
  winTypeSchema,
} from "@teambrewer/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { LOSS_REASON_LABELS, SELECT_CLASS, WIN_TYPE_LABELS } from "../game-display";
import { CardCaptureList } from "./CardCaptureList";
import type { OpponentKind } from "./opponent";

/** Step 4 (optional) — captured cards plus the deeper detail fields, then Save. */
export function StepNotes({
  teamId,
  impressiveCards,
  setImpressiveCards,
  underperformingCards,
  setUnderperformingCards,
  onCaptureCard,
  cardNameOf,
  opponentKind,
  effectivePilotUserId,
  setPilotUserId,
  memberOptions,
  externalOpponentName,
  setExternalOpponentName,
  metaId,
  setMetaId,
  metaOptions,
  winType,
  setWinType,
  lossReason,
  setLossReason,
  learnings,
  setLearnings,
  onSave,
  isPending,
  isEditing,
}: {
  teamId: string | undefined;
  impressiveCards: GameLogCardInput[];
  setImpressiveCards: (next: GameLogCardInput[]) => void;
  underperformingCards: GameLogCardInput[];
  setUnderperformingCards: (next: GameLogCardInput[]) => void;
  onCaptureCard: (card: CardSummary) => void;
  cardNameOf: (cardId: string) => string;
  opponentKind: OpponentKind;
  effectivePilotUserId: string;
  setPilotUserId: (userId: string) => void;
  memberOptions: TeamMember[];
  externalOpponentName: string;
  setExternalOpponentName: (name: string) => void;
  metaId: string;
  setMetaId: (metaId: string) => void;
  metaOptions: MetaSummary[];
  winType: WinType | "";
  setWinType: (winType: WinType | "") => void;
  lossReason: LossReason | "";
  setLossReason: (lossReason: LossReason | "") => void;
  learnings: string;
  setLearnings: (learnings: string) => void;
  onSave: () => void;
  isPending: boolean;
  isEditing: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <CardCaptureList
        teamId={teamId}
        label="Impressive cards"
        value={impressiveCards}
        onChange={setImpressiveCards}
        onCapture={onCaptureCard}
        nameOf={cardNameOf}
      />
      <CardCaptureList
        teamId={teamId}
        label="Underperforming cards"
        value={underperformingCards}
        onChange={setUnderperformingCards}
        onCapture={onCaptureCard}
        nameOf={cardNameOf}
      />

      <div className="flex flex-col gap-4 rounded-md border border-border p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="game-pilot">Pilot (defaults to you)</Label>
          <select
            id="game-pilot"
            className={SELECT_CLASS}
            value={effectivePilotUserId}
            onChange={(event) => setPilotUserId(event.target.value)}
          >
            {memberOptions.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </select>
        </div>

        {opponentKind !== "teammate" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="game-opponent-name">Opponent name (optional)</Label>
            <Input
              id="game-opponent-name"
              placeholder="Who did you play against?"
              value={externalOpponentName}
              onChange={(event) => setExternalOpponentName(event.target.value)}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label htmlFor="game-meta">Meta (optional)</Label>
          <select
            id="game-meta"
            className={SELECT_CLASS}
            value={metaId}
            onChange={(event) => setMetaId(event.target.value)}
          >
            <option value="">No meta</option>
            {metaOptions.map((meta) => (
              <option key={meta.id} value={meta.id}>
                {meta.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="game-win-type">Win type (optional)</Label>
          <select
            id="game-win-type"
            className={SELECT_CLASS}
            value={winType}
            onChange={(event) => setWinType(event.target.value as WinType | "")}
          >
            <option value="">—</option>
            {winTypeSchema.options.map((option) => (
              <option key={option} value={option}>
                {WIN_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="game-loss-reason">Loss reason (optional)</Label>
          <select
            id="game-loss-reason"
            className={SELECT_CLASS}
            value={lossReason}
            onChange={(event) => setLossReason(event.target.value as LossReason | "")}
          >
            <option value="">—</option>
            {lossReasonSchema.options.map((option) => (
              <option key={option} value={option}>
                {LOSS_REASON_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="game-learnings">Learnings (optional)</Label>
          <textarea
            id="game-learnings"
            className="min-h-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={learnings}
            onChange={(event) => setLearnings(event.target.value)}
            placeholder="What did this game teach the team?"
          />
        </div>
      </div>

      <div>
        <Button type="button" onClick={onSave} disabled={isPending}>
          {isEditing ? "Save changes" : "Save"}
        </Button>
      </div>
    </div>
  );
}
