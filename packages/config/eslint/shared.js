import tseslint from "typescript-eslint";

/** Project-wide rule overrides, shared by the apps and the library packages. */
export const overrideRules = {
  "@typescript-eslint/array-type": "off",
  "@typescript-eslint/consistent-type-definitions": "off",
  "@typescript-eslint/consistent-type-imports": [
    "warn",
    { prefer: "type-imports", fixStyle: "inline-type-imports" },
  ],
  // All three patterns, not just args. The `_` prefix already meant "declared
  // deliberately, not read" everywhere in this repo: type-level assertions like
  // `type _MeetingRowCheck = MeetingRow` that keep a hand-written select in
  // step with its row type, and `const [_, x] = ...` discards in tests. Only
  // the args form was configured, so all of those still warned.
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/no-misused-promises": [
    "error",
    { checksVoidReturn: { attributes: false } },
  ],
};

export const linterOptions = {
  linterOptions: { reportUnusedDisableDirectives: true },
  languageOptions: { parserOptions: { projectService: true } },
};

/**
 * Type-aware parser options for a package whose `tsconfig.json` leaves tests
 * out (they are typechecked through a second tsconfig). `projectService`
 * resolves each file's nearest tsconfig only, so such files would fail to
 * parse; naming the tsconfigs explicitly covers them.
 *
 * @param {string[] | undefined} project
 * @param {string | undefined} tsconfigRootDir
 */
export function parserOptionsFor(project, tsconfigRootDir) {
  if (!project) return linterOptions;
  return {
    linterOptions: linterOptions.linterOptions,
    languageOptions: { parserOptions: { project, tsconfigRootDir } },
  };
}
