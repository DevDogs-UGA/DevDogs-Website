import { describe, expect, it } from "vitest";
import {
  acceptAll,
  applyDecisions,
  mergeFile,
  rejectAll,
  splitLines,
} from "./merge.js";

const L = (...lines: string[]) => lines.map((l) => `${l}\n`).join("");

describe("mergeFile", () => {
  it("has no changes when nothing differs", () => {
    const m = mergeFile({
      base: L("a", "b"),
      ours: L("a", "b"),
      theirs: L("a", "b"),
    });
    expect(m.changes).toEqual([]);
    expect(acceptAll(m).text).toBe(L("a", "b"));
  });

  it("proposes the step's edit where ours is untouched", () => {
    const m = mergeFile({
      base: L("a", "b", "c"),
      ours: L("a", "b", "c"),
      theirs: L("a", "B", "c"),
    });
    expect(m.changes).toHaveLength(1);
    expect(m.changes[0]).toMatchObject({
      base: ["b\n"],
      ours: ["b\n"],
      theirs: ["B\n"],
      oursStart: 1,
      acceptedStart: 1,
    });
    expect(acceptAll(m).text).toBe(L("a", "B", "c"));
    expect(rejectAll(m).text).toBe(L("a", "b", "c"));
  });

  it("marks nothing where they made the same edit", () => {
    const m = mergeFile({
      base: L("a", "b"),
      ours: L("a", "B"),
      theirs: L("a", "B"),
    });
    expect(m.changes).toEqual([]);
    expect(acceptAll(m).text).toBe(L("a", "B"));
  });

  it("keeps their own edits that the step doesn't touch", () => {
    const m = mergeFile({
      base: L("a", "b", "c", "d"),
      ours: L("A", "b", "c", "d"),
      theirs: L("a", "b", "c", "D"),
    });
    expect(m.changes).toHaveLength(1);
    expect(acceptAll(m).text).toBe(L("A", "b", "c", "D"));
    expect(rejectAll(m).text).toBe(L("A", "b", "c", "d"));
  });

  it("marks a differing edit with the step's version as the proposal", () => {
    const m = mergeFile({
      base: L("a", "b"),
      ours: L("a", "mine"),
      theirs: L("a", "step"),
    });
    expect(m.changes).toHaveLength(1);
    expect(m.changes[0]).toMatchObject({
      ours: ["mine\n"],
      theirs: ["step\n"],
    });
    expect(rejectAll(m).text).toBe(L("a", "mine"));
    expect(acceptAll(m).text).toBe(L("a", "step"));
  });

  it("decides each change on its own", () => {
    const m = mergeFile({
      base: L("a", "x", "b", "y", "c"),
      ours: L("a", "x", "b", "y", "c"),
      theirs: L("a", "X", "b", "Y", "c"),
    });
    expect(m.changes).toHaveLength(2);
    expect(
      applyDecisions(
        m,
        new Map([
          [0, "accept"],
          [1, "reject"],
        ]),
      ).text,
    ).toBe(L("a", "X", "b", "y", "c"));
    expect(
      applyDecisions(m, (id) => (id === 1 ? "accept" : "reject")).text,
    ).toBe(L("a", "x", "b", "Y", "c"));
    // Undecided defaults to reject, or to whatever fallback says.
    expect(applyDecisions(m, new Map()).text).toBe(L("a", "x", "b", "y", "c"));
    expect(applyDecisions(m, new Map(), "accept").text).toBe(
      L("a", "X", "b", "Y", "c"),
    );
  });

  it("records where each change sits in ours and in the accepted file", () => {
    const m = mergeFile({
      base: L("a", "b", "c"),
      ours: L("a", "b", "c"),
      theirs: L("new", "new2", "a", "b", "c", "d"),
    });
    expect(m.changes.map((c) => [c.oursStart, c.acceptedStart])).toEqual([
      [0, 0],
      [3, 5],
    ]);
  });

  it("handles insertions and deletions by the step", () => {
    const m = mergeFile({
      base: L("a", "b", "c"),
      ours: L("a", "b", "c"),
      theirs: L("a", "c"),
    });
    expect(m.changes[0]).toMatchObject({ ours: ["b\n"], theirs: [] });
    expect(acceptAll(m).text).toBe(L("a", "c"));
  });

  it("treats touching edits as one conflict, like git", () => {
    const m = mergeFile({
      base: L("a", "b", "c"),
      ours: L("A", "b", "c"),
      theirs: L("a", "B", "c"),
    });
    expect(m.changes).toHaveLength(1);
    expect(m.changes[0]!.theirs).toEqual(L("a", "B").split(/(?<=\n)/));
  });

  it("preserves CRLF and a missing final newline", () => {
    const m = mergeFile({
      base: "a\r\nb",
      ours: "a\r\nb",
      theirs: "a\r\nb\r\nc",
    });
    expect(acceptAll(m).text).toBe("a\r\nb\r\nc");
    expect(rejectAll(m).text).toBe("a\r\nb");
  });

  describe("whole files", () => {
    it("adds a file they don't have", () => {
      const m = mergeFile({ base: null, ours: null, theirs: L("x") });
      expect(m.changes).toHaveLength(1);
      expect(acceptAll(m)).toEqual({ text: L("x"), exists: true });
      expect(rejectAll(m)).toEqual({ text: "", exists: false });
    });

    it("marks nothing when both added the same file", () => {
      const m = mergeFile({ base: null, ours: L("x"), theirs: L("x") });
      expect(m.changes).toEqual([]);
    });

    it("conflicts when both added different files", () => {
      const m = mergeFile({ base: null, ours: L("mine"), theirs: L("step") });
      expect(rejectAll(m)).toEqual({ text: L("mine"), exists: true });
      expect(acceptAll(m)).toEqual({ text: L("step"), exists: true });
    });

    it("deletes a file when the step does", () => {
      const m = mergeFile({ base: L("x"), ours: L("x"), theirs: null });
      expect(acceptAll(m)).toEqual({ text: "", exists: false });
      expect(rejectAll(m)).toEqual({ text: L("x"), exists: true });
    });

    it("keeps an existing but emptied file", () => {
      const m = mergeFile({ base: L("x"), ours: L("x"), theirs: "" });
      expect(acceptAll(m)).toEqual({ text: "", exists: true });
    });

    it("leaves a file they already deleted alone", () => {
      const m = mergeFile({ base: L("x"), ours: null, theirs: null });
      expect(m.changes).toEqual([]);
      expect(acceptAll(m).exists).toBe(false);
    });
  });
});

describe("splitLines", () => {
  it("keeps terminators and copes with empty input", () => {
    expect(splitLines("a\nb")).toEqual(["a\n", "b"]);
    expect(splitLines("")).toEqual([]);
    expect(splitLines(null)).toEqual([]);
  });
});
