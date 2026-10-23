"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

/**
 * The segmented code field behind `ui/code-input.tsx`: one cell per character,
 * focus that follows the typing, paste that fills the whole row, backspace that
 * walks back.
 *
 * Two shapes use it. The check-in meeting code is six digits (`"digits"`); the
 * device-login code is eight characters shown `XXXX-XXXX` (`"alphanumeric"`,
 * uppercased as it is typed, dashes and spaces dropped from anything pasted).
 * The value it reports never contains the dash; `formatCode` adds it for display.
 */
export type CodeKind = "digits" | "alphanumeric";

export interface CodeInputOptions {
  length: number;
  kind?: CodeKind;
  /** Controlled value. Omit it (and pass `defaultValue`) to let the hook own it. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Fires once each time every cell becomes filled. */
  onComplete?: (value: string) => void;
}

/** Strips a typed or pasted string down to the characters this kind of code allows. */
export function sanitizeCode(raw: string, kind: CodeKind): string {
  return kind === "digits"
    ? raw.replace(/\D/g, "")
    : raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** `ABCD1234` becomes `ABCD-1234`; a six-digit code stays as it is. */
export function formatCode(value: string, length = value.length): string {
  return length === 8
    ? `${value.slice(0, 4)}-${value.slice(4)}`.replace(/-$/, "")
    : value;
}

/** Cells array (one string of 0 or 1 characters per cell) from a flat value. */
function toCells(value: string, length: number): string[] {
  return Array.from({ length }, (_, i) => value[i] ?? "");
}

/**
 * Writes `chars` into `cells` from `start`, clipped to the row. Pure, so the
 * behaviour is testable without a DOM. Returns the new cells and the index the
 * focus should land on (the cell after the last one written, clamped).
 */
export function fillCells(
  cells: readonly string[],
  start: number,
  chars: string,
): { cells: string[]; focus: number } {
  const next = [...cells];
  let written = 0;
  for (const ch of chars) {
    if (start + written >= next.length) break;
    next[start + written] = ch;
    written += 1;
  }
  return {
    cells: next,
    focus: Math.min(start + written, next.length - 1),
  };
}

export function useCodeInput({
  length,
  kind = "digits",
  value: controlled,
  defaultValue = "",
  onChange,
  onComplete,
}: CodeInputOptions) {
  const [own, setOwn] = useState(() =>
    toCells(sanitizeCode(controlled ?? defaultValue, kind), length),
  );
  // The reported value drops blank cells ("12456" with digit 3 cleared), so a
  // controlled value can't carry positions back in. The hook keeps its own
  // cells either way, and rebuilds them from the parent's value only when the
  // parent changed it (a reset, a prefill) rather than echoed it.
  const cells =
    controlled === undefined || sanitizeCode(controlled, kind) === own.join("")
      ? own
      : toCells(sanitizeCode(controlled, kind), length);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focusCell = useCallback((index: number) => {
    const el = refs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const commit = useCallback(
    (next: string[]) => {
      setOwn(next);
      const joined = next.join("");
      onChange?.(joined);
      if (next.every((c) => c !== "")) onComplete?.(joined);
    },
    [onChange, onComplete],
  );

  const paste = useCallback(
    (index: number, raw: string) => {
      const chars = sanitizeCode(raw, kind);
      if (chars === "") return;
      // A whole code replaces the row wherever it lands; a fragment goes in at
      // the cell it was pasted into.
      const start = chars.length >= length ? 0 : index;
      const result = fillCells(cells, start, chars);
      commit(result.cells);
      focusCell(result.focus);
    },
    [cells, commit, focusCell, kind, length],
  );

  const cellProps = (index: number) => ({
    ref: (el: HTMLInputElement | null) => {
      refs.current[index] = el;
    },
    value: cells[index] ?? "",
    type: "text" as const,
    inputMode: kind === "digits" ? ("numeric" as const) : ("text" as const),
    // The first cell carries the autofill hint: a one-time-code suggestion
    // arrives as one multi-character change on it, handled as a paste below.
    autoComplete: index === 0 ? "one-time-code" : "off",
    autoCapitalize: kind === "digits" ? "off" : "characters",
    spellCheck: false,
    pattern: kind === "digits" ? "[0-9]*" : "[A-Za-z0-9]*",
    "aria-label": `${kind === "digits" ? "Digit" : "Character"} ${index + 1} of ${length}`,
    onFocus: (e: React.FocusEvent<HTMLInputElement>) =>
      e.currentTarget.select(),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const previous = cells[index] ?? "";
      let raw = e.target.value;
      // Typing over a filled cell yields "old+new" or "new+old" depending on
      // the caret; keep only the new character.
      if (previous && raw.length === 2) {
        raw = raw.startsWith(previous) ? raw.slice(1) : raw.slice(0, 1);
      }
      const chars = sanitizeCode(raw, kind);
      if (chars === "") {
        // Rejected character (a letter in a digit field): leave the cell alone.
        if (raw === "") {
          const next = [...cells];
          next[index] = "";
          commit(next);
        }
        return;
      }
      if (chars.length > 1) {
        paste(index, chars);
        return;
      }
      const result = fillCells(cells, index, chars);
      commit(result.cells);
      focusCell(result.focus);
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Backspace": {
          e.preventDefault();
          const next = [...cells];
          if (next[index] !== "") {
            next[index] = "";
            commit(next);
          } else if (index > 0) {
            next[index - 1] = "";
            commit(next);
            focusCell(index - 1);
          }
          break;
        }
        case "Delete": {
          e.preventDefault();
          const next = [...cells];
          next[index] = "";
          commit(next);
          break;
        }
        case "ArrowLeft":
          if (index > 0) {
            e.preventDefault();
            focusCell(index - 1);
          }
          break;
        case "ArrowRight":
          if (index < length - 1) {
            e.preventDefault();
            focusCell(index + 1);
          }
          break;
        case "Home":
          e.preventDefault();
          focusCell(0);
          break;
        case "End":
          e.preventDefault();
          focusCell(length - 1);
          break;
      }
    },
    onPaste: (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      paste(index, e.clipboardData.getData("text"));
    },
  });

  const value = cells.join("");
  const clear = useCallback(() => {
    commit(toCells("", length));
    focusCell(0);
  }, [commit, focusCell, length]);

  return {
    value,
    cells,
    /** `ABCD-1234` for an eight-character code, else the value as is. */
    formatted: formatCode(value, length),
    complete: cells.every((c) => c !== ""),
    cellProps,
    focus: focusCell,
    clear,
  };
}
