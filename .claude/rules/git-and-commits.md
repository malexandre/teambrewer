# Rule: Git & Commits

The project is version-controlled from the start and will live on GitHub.

## Commits

- **Conventional Commits.** Format: `type(scope): summary`.
  - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`.
  - Scope = feature/module or area, e.g. `feat(decks):`, `test(tenancy):`, `docs(adr):`, `chore(repo):`.
  - Summary: imperative mood, lower-case, no trailing period (e.g. "add deck status lifecycle").
- **Commit often and atomically.** Each commit is one coherent, self-contained change that builds and
  passes tests. Don't bundle unrelated changes; don't leave the tree broken between commits.
- Keep docs/decisions in sync **within the same commit** as the code they describe.
- Reference the phase in the body when implementing a plan phase (e.g. "Part of phase-03-decks").

## Branching & workflow

- `main` is the integration branch and should stay green.
- Do real work on feature branches (e.g. `phase-03-decks`, `feat/matchup-matrix`); open a PR to merge.
- Only commit/push when the user asks, or per the active workflow. If on `main` for a substantive change,
  branch first.
- Interactive git flags (`-i`) are not available in this environment.

## Hygiene

- `.gitignore` covers `node_modules`, build output, `.env`, coverage, and local artifacts. Never commit
  secrets or `.env` (commit `.env.example` instead).
- Small, reviewable PRs mapped to a phase or a slice of one.

## Attribution

- End commit messages with the Co-Authored-By trailer required by the environment.
- End PR bodies with the Claude Code generation note required by the environment.
