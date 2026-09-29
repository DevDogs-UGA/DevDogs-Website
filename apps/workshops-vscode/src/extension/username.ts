import { isValidUsername } from "../core/index.js";

/**
 * Where the GitHub username comes from, tried in order: VS Code's own GitHub
 * sign-in (silently), then `gh` if it happens to be installed, then asking
 * once. Each source is injected so the order and the "only a real login
 * counts" rule are tested without VS Code or a network.
 */

export type UsernameSource = () => Promise<string | undefined>;

/**
 * The first source that yields a valid GitHub login. A source that throws or
 * returns junk is skipped, never fatal: none of them is required.
 */
export async function resolveUsername(
  sources: readonly UsernameSource[],
): Promise<string | undefined> {
  for (const source of sources) {
    try {
      const value = (await source())?.trim();
      if (value && isValidUsername(value)) return value;
    } catch {
      // Not signed in, no gh, cancelled: try the next source.
    }
  }
  return undefined;
}
