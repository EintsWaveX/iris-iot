// @ts-check
import eslintPluginAstro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist/**", ".astro/**", "node_modules/**", "drizzle/**", ".remember/**"],
  },
  ...eslintPluginAstro.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Prefixing with _ is the project-wide convention for "yes, unused,
      // on purpose" (e.g. destructuring to drop a field), rather than
      // silencing the rule entirely.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // CLI scripts, not app code -- printing progress to stdout is the job.
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];
