import { autocompleteMultiselect, multiselect } from "@clack/prompts";
import type { Format } from "@devdogsuga/brand";
import { isNonInteractive } from "@devdogsuga/cli-core/mode";
import { unwrap, UsageError } from "@devdogsuga/cli-core/ui";
import type { Graphic } from "./registry.js";
import { formatsFor } from "./select.js";

/**
 * What the command asks for when the command line did not say.
 *
 * Two questions, and each one is skipped entirely when a flag answered it, so
 * a scripted invocation never blocks. That is the whole contract: this command
 * has to be usable both as "make me the September 8 posters" typed by an
 * officer who does not remember the format names, and as a line in a build.
 *
 * {@link requireInteractive} is what keeps the second half true. Without it a
 * missing flag in CI would hang on a prompt nobody can answer until the job
 * times out, which is the least debuggable failure available.
 */

/** Refuses, naming the flag, rather than prompting where nobody can answer. */
export function requireInteractive(what: string, flag: string): void {
  if (!isNonInteractive()) return;

  throw new UsageError(
    `No terminal to ask which ${what} to use. Pass ${flag}: this is not an interactive shell.`,
  );
}

/**
 * Which graphics.
 *
 * Autocomplete rather than a plain list: there are dozens once a semester of
 * meetings is loaded, and the useful interaction is typing "sep" or "dogdays"
 * rather than scrolling. Grouped by prefix in the label so the list reads as
 * the `group/name` vocabulary the flags use.
 */
export async function pickGraphics(
  graphics: readonly Graphic[],
): Promise<Graphic[]> {
  requireInteractive("graphics", "a graphic name, or `*` for all of them");

  const chosen = unwrap(
    await autocompleteMultiselect({
      message: "Which images?",
      options: graphics.map((graphic) => ({
        value: graphic.name,
        label: graphic.name,
        hint: graphic.why,
      })),
    }),
  );

  return graphics.filter((graphic) => chosen.includes(graphic.name));
}

/**
 * Which formats.
 *
 * Offered from the union of what the chosen graphics support, so the list never
 * contains a size that would be skipped — asking somebody to pick `savvycal`
 * for an event and then quietly not rendering it is worse than not offering it.
 */
export async function pickFormats(
  graphics: readonly Graphic[],
): Promise<string[]> {
  requireInteractive("formats", "--format or --all-formats");

  const available = formatsFor(graphics);

  return unwrap(
    await multiselect({
      message: "Which formats?",
      options: available.map((format: Format) => ({
        value: format.name,
        label: format.name,
        hint: format.why,
      })),
      // The link card is what most of these are for, and it is supported by
      // every graphic that is not an icon.
      initialValues: available.some((format) => format.name === "og")
        ? ["og"]
        : [],
    }),
  );
}
