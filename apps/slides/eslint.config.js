import { libraryEslintConfig } from "@devdogsuga/config/eslint/library";

// Only the Worker is linted: it is the one part of the app with a TypeScript
// project of its own (worker/tsconfig.json). The theme and scripts run under
// Slidev/Vite and are not covered by any tsconfig.
export default libraryEslintConfig({
  project: ["./worker/tsconfig.json"],
  tsconfigRootDir: import.meta.dirname,
  ignores: ["**/worker-configuration.d.ts"],
});
