import tseslint from "typescript-eslint";
import nextConfig from "eslint-config-next/core-web-vitals";
// @ts-ignore -- no types for this plugin
import drizzle from "eslint-plugin-drizzle";
import { overrideRules, linterOptions } from "./shared.js";

// `eslint-config-next` already registers the `@typescript-eslint` plugin and
// parser. Spreading `tseslint.configs.*` on top re-registers it and throws
// "Cannot redefine plugin @typescript-eslint" (the two packages resolve to
// different plugin instances). So harvest just the RULES from the type-checked
// presets and layer them onto Next's existing plugin registration.
const typeCheckedRules = [
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
].reduce((rules, config) => Object.assign(rules, config.rules), {});

/**
 * Flat ESLint config for the Next.js apps (platform, schedule-builder).
 *
 * @param {object} [options]
 * @param {boolean} [options.drizzle] Enable the drizzle safety rules (db/ctx.db).
 * @param {boolean} [options.switchExhaustiveness] Enable switch-exhaustiveness-check.
 * @param {string[]} [options.ignores] Extra ignore globs (generated files, etc.).
 */
export function nextEslintConfig(options = {}) {
  const {
    drizzle: enableDrizzle = false,
    switchExhaustiveness = false,
    ignores = [],
  } = options;

  return tseslint.config(
    { ignores: [".next", "packages/*/dist/**", ...ignores] },
    ...nextConfig,
    {
      files: ["**/*.ts", "**/*.tsx"],
      ...(enableDrizzle ? { plugins: { drizzle } } : {}),
      rules: {
        ...typeCheckedRules,
        ...overrideRules,
        ...(switchExhaustiveness
          ? { "@typescript-eslint/switch-exhaustiveness-check": "error" }
          : {}),
        ...(enableDrizzle
          ? {
              "drizzle/enforce-delete-with-where": [
                "error",
                { drizzleObjectName: ["db", "ctx.db"] },
              ],
              "drizzle/enforce-update-with-where": [
                "error",
                { drizzleObjectName: ["db", "ctx.db"] },
              ],
            }
          : {}),
      },
    },
    linterOptions,
  );
}

export { libraryEslintConfig } from "./library.js";
