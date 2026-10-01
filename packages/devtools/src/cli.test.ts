/**
 * The dispatcher's table and the command tree must name the same commands:
 * a declared command with no handler would be in `--help` and the menu and
 * then answer "Unknown command", and a handler with no declaration would be
 * reachable but undiscoverable.
 */
import { describe, expect, it } from "vitest";
import { catalog } from "./catalog.js";
import { HANDLERS } from "./cli.js";

describe("the dispatch table", () => {
  it("has a handler for every top-level command in the tree", () => {
    for (const command of catalog.topLevel) {
      expect(HANDLERS[command.name], command.name).toBeTypeOf("function");
    }
  });

  it("has no handler the tree does not declare", () => {
    const declared = new Set(catalog.topLevel.map((command) => command.name));
    for (const name of Object.keys(HANDLERS)) {
      expect(declared.has(name), name).toBe(true);
    }
  });
});
