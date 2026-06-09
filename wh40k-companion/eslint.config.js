import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// Flat config tuned to this project: 100% inline-styled React SPA, no prop-types,
// no TypeScript. We lint for real bugs (hook rules, undefined refs, unused code)
// and stay quiet about style choices the project makes on purpose.
export default [
  { ignores: ["dist", "dev-dist", "node_modules", "patches"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "18.3" } },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Mark components/vars referenced in JSX as used (the new JSX transform
      // means we don't need React in scope, only jsx-uses-vars).
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Allow intentional throwaways (caught errors, _-prefixed) without noise.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.test.{js,jsx}"],
    languageOptions: { globals: { ...globals.node } },
  },
];
