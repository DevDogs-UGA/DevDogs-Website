import tseslint from "typescript-eslint";
import { overrideRules, parserOptionsFor } from "./shared.js";

/**
 * Flat ESLint config for the plain TypeScript library packages (no Next plugin).
 *
 * @param {object} [options]
 * @param {string[]} [options.ignores] Extra ignore globs.
 * @param {string[]} [options.project] tsconfig paths to type-check against,
 *   instead of each file's nearest tsconfig (use when tests live in a second
 *   tsconfig).
 * @param {string} [options.tsconfigRootDir] Base for `project` (pass
 *   `import.meta.dirname`).
 */
export function libraryEslintConfig(options = {}) {
  const { ignores = [], project, tsconfigRootDir } = options;

  return tseslint.config(
    { ignores: ["dist/**", ...ignores] },
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      files: ["**/*.ts", "**/*.tsx"],
      rules: {
        ...overrideRules,
        // tsconfig.base.json sets noPropertyAccessFromIndexSignature, which
        // REQUIRES bracket access on index-signature types (process.env["X"]).
        // The default rule flags exactly those and its autofix would break
        // tsc, so it has to be told to allow them.
        "@typescript-eslint/dot-notation": [
          "error",
          { allowIndexSignaturePropertyAccess: true },
        ],
      },
    },
    parserOptionsFor(project, tsconfigRootDir),
    // Plain JS (bin shims, build scripts) sits outside every tsconfig, so the
    // type-aware rules have nothing to read there.
    {
      files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
      ...tseslint.configs.disableTypeChecked,
    },
  );
}
