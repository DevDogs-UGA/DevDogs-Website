import { libraryEslintConfig } from "@devdogsuga/config/eslint/library";

const base = libraryEslintConfig({
  project: ["./tsconfig.json"],
  tsconfigRootDir: import.meta.dirname,
  ignores: ["data/**"],
});

export default [
  ...base,
  {
    // The contract tests read JSON bodies and assert on them; typing every
    // field of every response here would restate the OpenAPI file, which is
    // what validates the shapes (test/spec.ts).
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
];
