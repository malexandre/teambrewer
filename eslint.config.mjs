// Shared flat ESLint config for the whole monorepo. Non-type-checked `recommended`
// rules keep this fast and robust across a fresh workspace; type-aware linting can
// be layered on later once every package's tsconfig is settled.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.gen.ts",
      "**/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: [
      "apps/api/**/*.ts",
      "packages/**/*.ts",
      "**/*.config.{ts,mts,cts,js,mjs,cjs}",
      "**/*.{js,mjs,cjs}",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  eslintConfigPrettier,
);
