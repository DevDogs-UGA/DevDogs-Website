import { libraryEslintConfig } from "@devdogsuga/config/eslint/library";

export default libraryEslintConfig({
  project: ["./tsconfig.json"],
  tsconfigRootDir: import.meta.dirname,
  ignores: ["dist-test/**", ".vscode-test/**"],
});
