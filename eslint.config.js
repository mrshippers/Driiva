// Flat ESLint config for the Driiva root app (client/server/shared/api).
// Scope: the React+Vite client and the Express server only. The other
// workspaces (functions/, mobile/, apps/marketing/) own their own lint setup
// and are ignored here. Severity policy: rules that catch real bugs are
// errors; stylistic/hygiene rules are warnings so the gate can be clean
// without gold-plating. Run: `npm run lint`.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/*.min.js",
      ".claude/**", // nested git worktrees + caches
      ".cursor/**",
      ".vercel/**",
      "coverage/**",
      "functions/**",
      "mobile/**",
      "apps/**",
      "driiva-design-system/**",
      "design-system/**",
      "hyperframes/**",
      "claude-sentinel/**",
      "scripts/**",
      "firestore-backup/**",
      "Driiva Marketing/**",
      "Driiva Stages/**",
      "Driiva HyperFrames/**",
      "Marketing/**",
      "Workspaces/**",
      "client/public/**",
      "server/public/**",
      "api/_server.js",
      "api/main.py",
      "**/*.config.{js,ts,cjs,mjs}",
      "**/*.test.{ts,tsx}",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2024 },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Real bugs — keep as errors.
      "react-hooks/rules-of-hooks": "error",
      "no-undef": "off", // TypeScript handles undefined identifiers; avoids false positives on types/globals.
      "no-constant-condition": ["error", { checkLoops: false }],

      // Hygiene — warnings, not blockers.
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-assignment": "warn", // hygiene, not correctness; flags defensive inits + dead code
      "preserve-caught-error": "error", // flag re-throws that drop the original error (no `cause`)
    },
  },
);
