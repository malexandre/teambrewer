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

## Local-first — the remote is optional and deferred

**Everything works fully locally without a GitHub (or any) remote.** The remote will be set up much later.

- **Do not create or push to a remote unless the user explicitly asks.** `git push` is an outward-facing
  action requiring the user's go-ahead.
- Integrate by **merging feature branches into `main` locally with a fast-forward merge** (`git merge
  --ff-only`), not via pull requests, until a remote exists. **Do not use `--no-ff`** — history stays linear
  and the detail lives in the atomic commits themselves. If `main` has advanced so a fast-forward isn't
  possible, **rebase the branch onto the latest `main` first** (`git rebase main`), then `--ff-only`.
- **GitHub Actions CI runs only once a remote exists.** Until then, the verification bar is running the same
  steps locally: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`. A phase is "done" on local
  green, not on CI.
- PRs and their conventions below apply **only after** a remote is configured.

## Branching & workflow

- `main` is the integration branch and should stay green.
- Do real work on feature branches (e.g. `phase-03-decks`, `feat/matchup-matrix`); **fast-forward** merge to
  `main` locally (rebase onto `main` first if needed; open a PR instead once a remote exists).
- Only commit when the user asks, or per the active workflow. If on `main` for a substantive change,
  branch first. Never push without an explicit request.
- Interactive git flags (`-i`) are not available in this environment.

## Hygiene

- `.gitignore` covers `node_modules`, build output, `.env`, coverage, and local artifacts. Never commit
  secrets or `.env` (commit `.env.example` instead).
- Small, reviewable changes mapped to a phase or a slice of one (as local commits now; as PRs once a
  remote exists).

## Attribution

- End commit messages with the Co-Authored-By trailer required by the environment.
- End PR bodies with the Claude Code generation note required by the environment (when PRs are used, i.e.
  after a remote is configured).
