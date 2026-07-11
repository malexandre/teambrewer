/**
 * Enforce Conventional Commits (see .claude/rules/git-and-commits.md).
 * config-conventional's default type-enum already covers our allowed types:
 * feat, fix, docs, refactor, test, chore, build, ci, perf, style (plus revert).
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
};
