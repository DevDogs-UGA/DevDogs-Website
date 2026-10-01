import { describe, expect, it } from "vitest";
import { parseWorkerEntries } from "./workers.js";

describe("parseWorkerEntries", () => {
  it("reads the bare paths workers.json has always held", () => {
    expect(parseWorkerEntries(["apps/platform", "apps/sandbox"])).toEqual([
      { path: "apps/platform" },
      { path: "apps/sandbox" },
    ]);
  });

  it("reads an object entry with its per-app data", () => {
    const smoke = { hosts: { staging: "s", production: "p" } };
    expect(parseWorkerEntries([{ path: "apps/platform", smoke }])).toEqual([
      { path: "apps/platform", smoke },
    ]);
  });

  it("allows the two to be mixed, so the field can arrive one app at a time", () => {
    expect(
      parseWorkerEntries([
        "apps/sandbox",
        { path: "apps/platform", smoke: {} },
      ]),
    ).toEqual([{ path: "apps/sandbox" }, { path: "apps/platform", smoke: {} }]);
  });

  it("names the entry it cannot read", () => {
    expect(() => parseWorkerEntries(["apps/platform", 3])).toThrow(/entry 1/);
    expect(() => parseWorkerEntries([{ smoke: {} }])).toThrow(/entry 0/);
    expect(() => parseWorkerEntries({})).toThrow(/array/);
  });
});
