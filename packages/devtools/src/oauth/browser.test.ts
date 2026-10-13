import { describe, expect, it } from "vitest";
import { browserCommand } from "./browser.js";

const URL_WITH_QUERY = "https://example.org/authorize?client_id=a&state=b";

describe("browserCommand", () => {
  it("opens URLs on Windows with rundll32, not cmd /c start, so an & survives", () => {
    expect(browserCommand(URL_WITH_QUERY, "win32")).toEqual([
      "rundll32",
      ["url.dll,FileProtocolHandler", URL_WITH_QUERY],
    ]);
  });

  it("uses open on macOS and xdg-open elsewhere", () => {
    expect(browserCommand(URL_WITH_QUERY, "darwin")).toEqual([
      "open",
      [URL_WITH_QUERY],
    ]);
    expect(browserCommand(URL_WITH_QUERY, "linux")).toEqual([
      "xdg-open",
      [URL_WITH_QUERY],
    ]);
  });
});
