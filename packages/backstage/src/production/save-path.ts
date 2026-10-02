/**
 * "Where should this go?": a save-as prompt with path completion.
 *
 * clack's own `path` prompt only submits a path that already exists (it is a
 * picker), so a new file name cannot be typed into it. This is the same
 * `autocomplete` underneath, with the typed path itself always first: Enter
 * saves exactly what was typed, the arrow keys pick a suggestion, and Tab
 * completes the highlighted one into the input to keep typing from, the way
 * a shell does. A directory, typed or picked, means the suggested file name
 * inside it.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { autocomplete, confirm } from "@clack/prompts";
import { unwrap } from "@devdogsuga/cli-core/ui";
import { expandHome } from "./cli.js";

export interface PathSuggestion {
  value: string;
  label: string;
  hint?: string;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * What to offer for `input`: the input itself, then the entries of the
 * directory it is being typed into whose names start with what follows the
 * last `/`, directories first and marked with a trailing `/`. Dotfiles only
 * when the name being typed starts with a dot. Values keep the input's own
 * spelling (`~/`, `./`) so completing one never rewrites what was typed.
 */
export function pathSuggestions(
  input: string,
  fileName: string,
): PathSuggestion[] {
  if (!input) return [];
  const full = expandHome(input);
  const typedIsDirectory = isDirectory(full);
  const own: PathSuggestion = {
    value: input,
    label: input,
    hint: typedIsDirectory
      ? `saves ${join(input, fileName)}`
      : existsSync(full)
        ? "replaces this file"
        : isDirectory(dirname(full))
          ? "new file"
          : "no such folder",
  };

  const cut = input.lastIndexOf("/") + 1;
  const lead = input.slice(0, cut);
  const prefix = input.slice(cut);
  let names: string[];
  try {
    names = readdirSync(expandHome(lead || "."));
  } catch {
    return [own];
  }
  const shown = (name: string) =>
    name.startsWith(prefix) &&
    (prefix.startsWith(".") || !name.startsWith("."));
  const entries = names
    .filter(shown)
    .map((name) => {
      const value = lead + name;
      return { name, value, directory: isDirectory(expandHome(value)) };
    })
    .sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name),
    )
    .map(({ value, directory }) => ({
      value: directory ? `${value}/` : value,
      label: directory ? `${value}/` : value,
    }))
    .filter((s) => s.value !== input);
  return [own, ...entries];
}

/** The file a submitted path names: a directory means `fileName` inside it. */
export function resolveSavePath(input: string, fileName: string): string {
  const full = expandHome(input.trim());
  return isDirectory(full) ? join(full, fileName) : full;
}

/**
 * The prompt's internals Tab needs. clack keeps these `protected`; the
 * version is pinned exactly in the workspace catalog, so a change to them
 * arrives as a deliberate bump.
 */
interface EditablePrompt {
  focusedValue: unknown;
  on(
    event: "key",
    cb: (char: string | undefined, key: { name?: string }) => void,
  ): void;
  _clearUserInput(): void;
  _setUserInput(value: string, write: boolean): void;
}

/**
 * Asks where to save a file, suggesting `suggested`. An existing file is only
 * replaced after a second, default-no question; answering no asks again.
 * Returns the full path (`~` expanded, a directory resolved to the file in it).
 */
export async function askSavePath(options: {
  message: string;
  suggested: string;
}): Promise<string> {
  const fileName = basename(options.suggested);
  for (;;) {
    let wired = false;
    const answer = unwrap(
      await autocomplete<string>({
        message: options.message,
        initialUserInput: options.suggested,
        maxItems: 6,
        // pathSuggestions has already matched on the typed prefix.
        filter: () => true,
        options() {
          if (!wired) {
            wired = true;
            const prompt = this as unknown as EditablePrompt;
            prompt.on("key", (_char, key) => {
              const focused = prompt.focusedValue;
              if (key.name !== "tab" || typeof focused !== "string") return;
              prompt._clearUserInput();
              prompt._setUserInput(focused, true);
            });
          }
          return pathSuggestions(this.userInput, fileName);
        },
        validate: (value) => {
          if (typeof value !== "string" || !value.trim())
            return "A path, please.";
          const folder = dirname(resolveSavePath(value, fileName));
          return isDirectory(folder) ? undefined : `${folder} does not exist.`;
        },
      }),
    );
    const path = resolveSavePath(answer, fileName);
    if (!existsSync(path)) return path;
    const replace = unwrap(
      await confirm({
        message: `${path} already exists. Replace it?`,
        initialValue: false,
      }),
    );
    if (replace) return path;
  }
}
