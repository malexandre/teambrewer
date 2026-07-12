---
name: start-next-phase
description: Use when the user asks to "start the next phase", "implement the next phase", "continue"/"resume" an unfinished phase, or begin/continue a specific TeamBrewer phase. Runs the phase end-to-end as autonomously as is safe, resumes an in-progress (🚧) phase where a prior session left off, then updates all progress trackers. Composes the implementing-a-phase skill and adds phase selection, a bounded-autonomy policy, and a definition of done.
---

# Start the Next Phase

Drive one TeamBrewer build phase from start to finish with minimal hand-holding, **without skipping the
questions that genuinely need a human.** This skill wraps [`implementing-a-phase`](../implementing-a-phase/SKILL.md)
— follow that skill's checklist for the actual work; this file adds *which* phase, *how autonomously*, and
*what "done" means*.

## 1. Orient (do this first, before touching code)

1. Read [`CLAUDE.md`](../../../CLAUDE.md) and [`docs/plans/README.md`](../../../docs/plans/README.md).
2. **Select the phase** from the status table:
   - If the user named one, use it.
   - Else if any phase is **🚧 in progress**, **resume that one** — finish in-progress work before starting
     anything new (see "Resuming an in-progress phase" below).
   - Else pick the **lowest-numbered ⛔ phase whose dependencies are all ✅**.
3. **State the chosen phase in your first message**, say whether you are **starting fresh or resuming**, and
   confirm its dependencies are done. If they aren't, stop and say so (see "Always stop and ask").
4. Invoke [`implementing-a-phase`](../implementing-a-phase/SKILL.md) and read the phase plan + every feature
   spec, ADR, and architecture doc it references. Create a todo per checklist item (marking already-done
   items complete when resuming — see below).

## Resuming an in-progress (🚧) phase

When the selected phase is already 🚧, **continue where the last session stopped — do not restart it.**
Reconstruct the current state before writing anything:

1. Read the phase plan's **handoff note** (if present) and its `- [ ]` checklist — checked boxes are the
   claimed-done work.
2. Find and check out the phase's **branch** (e.g. `phase-03-decks`); review `git log` to see what actually
   landed.
3. **Verify reality, don't trust the markers blindly:** run the test suite / the phase's verification steps
   to confirm what genuinely works. Reconcile any mismatch — if a box is checked but the tests disagree,
   the tests win; fix the box and the work.
4. Build your todo list from the **remaining** (unchecked / unverified) items and continue from there.
5. If the trackers are missing or unreliable (a prior session stopped abruptly), reconstruct state from
   `git log` + a full test run, and note what you inferred.

Then proceed with the same rules below. Naming a phase explicitly ("continue phase-03") forces resuming it.

## 2. Work autonomously — but within bounds

Default to **proceeding, not pausing.** Work test-first, follow every rule in
[`.claude/rules/`](../../rules/), commit often and atomically with Conventional Commits, and branch off
`main` first (e.g. `phase-03-decks`).

### Proceed WITHOUT asking (this is the autonomy)
- Routine implementation choices already determined by the specs, ADRs, or rules — naming, file placement,
  which documented pattern/helper to use, test structure.
- Obvious sensible defaults where the spec is clear. Record any non-trivial judgment call in the commit
  body (or as a doc/ADR update if it changes a decision).
- Normal iteration: writing tests, making them pass, refactoring, fixing your own failures.

### ALWAYS stop and ask (autonomy does NOT override these)
This is the safeguard. Pause and ask the user when:
- A requirement is **ambiguous or the docs are silent**, and the choice **materially changes behavior,
  data shape, or user experience**.
- Doing it correctly would **contradict or change a documented decision/ADR** — propose the change and its
  ADR update rather than silently diverging.
- The **specs/ADRs conflict** with each other or with reality, or something looks wrong or unsafe.
- A **security, tenancy, or privacy tradeoff** arises that the docs don't already settle.
- The phase's **scope looks materially larger/smaller** than the plan, or a dependency isn't actually done.
- You'd introduce a **new dependency, external service, or data source** not already sanctioned in
  [`data-sources`](../../rules/data-sources.md) / the ADRs.
- Any **irreversible or outward-facing action** (deleting data, `git push`, publishing, calling external
  services, changing settings/permissions) — confirm regardless of autonomy. The environment's safety
  rules always apply.

Rule of thumb: **autonomy is for choices the docs already answer; questions are for choices they don't.**
When unsure whether something is "routine," it isn't — ask. Asking a good question is success, not failure.

## 3. Definition of done (all required before claiming completion)

- Every step in the phase's **"Tests & verification"** section passes — **run the commands and show the
  actual output/evidence.** Never claim green without running them (see
  [`verification-before-completion`](../implementing-a-phase/SKILL.md) discipline).
- **Update the progress trackers:**
  - Flip this phase's row in [`docs/plans/README.md`](../../../docs/plans/README.md) to ✅ (or 🚧 if you
    genuinely could not finish).
  - Check the `- [ ]` boxes in the phase plan that are actually complete.
- **Keep docs in sync in the same commits:** update `CLAUDE.md` "Commands" if they changed, and any
  doc/ADR a decision touched.
- **Integrate and clean up the branch** (only after everything above is green, per
  [`git-and-commits`](../../rules/git-and-commits.md)):
  1. Ensure the tracker/doc updates are committed **on the phase branch**.
  2. Fast-forward merge into `main`: `git switch main && git merge --ff-only <phase-branch>` (if it won't
     fast-forward, `git switch <phase-branch> && git rebase main`, then retry). **Never `--no-ff`.**
  3. **Delete the merged feature branch:** `git branch -d <phase-branch>` (safe delete). If `-d` refuses
     because the branch isn't fully merged, **stop and investigate** — do NOT force-delete (`-D`); it means
     work didn't actually land on `main`.
  4. Do **not** push or create a remote (see "always stop and ask"). Leave `main` green and branch-free.

## 4. If you must stop early
Leave the phase **🚧**, make the checkboxes reflect reality, and commit what is green **on the phase
branch**. **Keep the branch — do not merge it into `main` or delete it** (the next session resumes from it,
per "Resuming an in-progress phase"). End with a short **handoff note**: the branch name, what's done,
what's left, and how to resume.

## 5. Final report
End with: the phase you implemented, the verification evidence, the trackers you updated, the branch/commits,
and anything deferred or any open question for the user.

---
**Note (not something a prompt controls):** going fully end-to-end unattended also needs an
autonomy-friendly permission mode (auto-accept edits / trusted command execution). If every action prompts
for approval, this skill will still pause for those approvals — that's the harness, not this skill, and it
does not replace the "always stop and ask" judgment above.
