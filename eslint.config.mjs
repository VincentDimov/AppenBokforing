import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "**/node_modules/**",
      "**/prisma/generated/**",
      "**/.turbo/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@next/next": nextPlugin
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: nextPlugin.configs.recommended.rules
  },
  {
    files: ["packages/db/prisma/**/*.mjs", "packages/db/test/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly"
      }
    }
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  prettier
);
