import { libraryEslintConfig } from "@devdogsuga/config/eslint/library";

export default libraryEslintConfig({
  project: ["./tsconfig.lint.json"],
  tsconfigRootDir: import.meta.dirname,
});
