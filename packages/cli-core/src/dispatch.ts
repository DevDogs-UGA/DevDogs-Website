/**
 * What a CLI's dispatcher and its domains agree on.
 *
 * A domain's `commands.ts` exports one `CommandHandler` per top-level command
 * it owns; the CLI's `cli.ts` maps command names to those handlers and does
 * nothing else with them. The wizard builds an argv and hands it to the same
 * dispatcher, so a menu walk and a typed command line take the identical path.
 */

/** The `outro()` line for a command that finished. */
export const DONE = "Done.";

/**
 * Runs the command with everything after its name, and reports what to print.
 *
 * Returns the `outro()` line, or `null` where the failure has already been
 * explained and a cheerful "Done." would contradict it.
 */
export type CommandHandler = (rest: string[]) => Promise<string | null>;
