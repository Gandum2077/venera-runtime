import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";

const typescriptFiles = ["**/*.{ts,mts,cts}"];
const javascriptFiles = ["**/*.{js,mjs,cjs}"];

export default defineConfig(
  globalIgnores([
    "**/node_modules/**",
    "dist/**",
    "coverage/**",
    ".fixtures/**",
    "test-results/**",
    "runtime-test-output/**",
    "app/main.js",
  ]),
  {
    files: [...javascriptFiles, ...typescriptFiles],
    extends: [js.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: { "no-eval": "error", "no-new-func": "error" },
  },
  {
    files: [
      "scripts/**/*.{js,cjs,mjs}",
      "*.config.{js,cjs,mjs,mts}",
      "examples/node/**/*.{js,cjs,mjs}",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["app/scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { $ui: "readonly", $l10n: "readonly" },
    },
  },
  {
    // Venera loads the named class from source text; it is not a CommonJS export.
    files: ["examples/demo-source.js"],
    languageOptions: {
      sourceType: "script",
      globals: { Comic: "readonly", ComicSource: "readonly" },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^DemoSource$" }],
    },
  },
  {
    files: typescriptFiles,
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        // Tests/examples use named tsconfigs. One explicit project covers all linted TS files.
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Formatting belongs to Prettier; keep this last to disable conflicting rules.
  prettier,
);
