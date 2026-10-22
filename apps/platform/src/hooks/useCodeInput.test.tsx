import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  fillCells,
  formatCode,
  sanitizeCode,
  useCodeInput,
} from "./useCodeInput";

function Harness({
  length,
  kind,
  onComplete,
}: {
  length: number;
  kind?: "digits" | "alphanumeric";
  onComplete?: (v: string) => void;
}) {
  const code = useCodeInput({ length, kind, onComplete });
  return (
    <div>
      {code.cells.map((_, i) => (
        <input key={i} {...code.cellProps(i)} />
      ))}
      <output data-testid="value">{code.value}</output>
      <output data-testid="formatted">{code.formatted}</output>
    </div>
  );
}

afterEach(cleanup);

describe("pure helpers", () => {
  it("sanitises per kind", () => {
    expect(sanitizeCode("12a-3 4", "digits")).toBe("1234");
    expect(sanitizeCode("ab-12 cd", "alphanumeric")).toBe("AB12CD");
  });
  it("formats an eight-character code with the dash", () => {
    expect(formatCode("ABCD1234")).toBe("ABCD-1234");
    expect(formatCode("123456")).toBe("123456");
  });
  it("fills from an index and clips at the row end", () => {
    expect(fillCells(["", "", ""], 1, "987")).toEqual({
      cells: ["", "9", "8"],
      focus: 2,
    });
  });
});

describe("useCodeInput", () => {
  it("labels every cell for assistive tech and hints one-time-code on the first", () => {
    render(<Harness length={6} />);
    expect(screen.getByLabelText("Digit 3 of 6")).toBeInTheDocument();
    const first = screen.getByLabelText("Digit 1 of 6");
    expect(first).toHaveAttribute("autocomplete", "one-time-code");
    expect(first).toHaveAttribute("inputmode", "numeric");
  });

  it("advances focus as digits are typed and ignores non-digits", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness length={6} onComplete={onComplete} />);
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("1a2");
    expect(screen.getByTestId("value")).toHaveTextContent("12");
    expect(screen.getByLabelText("Digit 3 of 6")).toHaveFocus();
    await user.keyboard("3456");
    expect(screen.getByTestId("value")).toHaveTextContent("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("fills every cell on paste", async () => {
    const user = userEvent.setup();
    render(<Harness length={6} />);
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.paste("482 913");
    expect(screen.getByTestId("value")).toHaveTextContent("482913");
    expect(screen.getByLabelText("Digit 6 of 6")).toHaveFocus();
  });

  it("moves back on backspace, clearing as it goes", async () => {
    const user = userEvent.setup();
    render(<Harness length={6} />);
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123");
    expect(screen.getByLabelText("Digit 4 of 6")).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(screen.getByTestId("value")).toHaveTextContent("12");
    expect(screen.getByLabelText("Digit 3 of 6")).toHaveFocus();
  });

  it("uppercases a device code and shows it as XXXX-XXXX", async () => {
    const user = userEvent.setup();
    render(<Harness length={8} kind="alphanumeric" />);
    await user.click(screen.getByLabelText("Character 1 of 8"));
    await user.paste("abcd-1234");
    expect(screen.getByTestId("value")).toHaveTextContent("ABCD1234");
    expect(screen.getByTestId("formatted")).toHaveTextContent("ABCD-1234");
  });
});
