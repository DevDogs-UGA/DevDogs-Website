import { libraryEslintConfig } from "@devdogsuga/config/eslint/library";

export default libraryEslintConfig({
  project: ["./tsconfig.lint.json"],
  tsconfigRootDir: import.meta.dirname,
  // Hand-written stand-in the tests read; never part of this package's code.
  ignores: ["test-fixtures/**"],
});
