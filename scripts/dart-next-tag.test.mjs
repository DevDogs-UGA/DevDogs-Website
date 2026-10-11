import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseVersion, nextTag } from "./dart-next-tag.mjs";

describe("dart-next-tag", () => {
  it("starts at 1", () => {
    assert.equal(nextTag("0.1.0", []), "devdogsuga_sdk-v0.1.0-next.1");
  });

  it("is one past the highest for this base, comparing numbers not strings", () => {
    assert.equal(
      nextTag("0.1.0", [
        "devdogsuga_sdk-v0.1.0-next.2",
        "devdogsuga_sdk-v0.1.0-next.10",
        "devdogsuga_sdk-v0.1.0-next.9",
      ]),
      "devdogsuga_sdk-v0.1.0-next.11",
    );
  });

  it("ignores other bases, stable tags and other packages", () => {
    assert.equal(
      nextTag("0.2.0", [
        "devdogsuga_sdk-v0.1.0-next.40",
        "devdogsuga_sdk-v0.2.0",
        "@devdogsuga/sdk@0.1.0",
      ]),
      "devdogsuga_sdk-v0.2.0-next.1",
    );
  });

  it("reads the base from pubspec.yaml and refuses a stamped prerelease", () => {
    assert.equal(baseVersion("name: x\nversion: 0.1.0\n"), "0.1.0");
    assert.throws(
      () => baseVersion("name: x\nversion: 0.1.0-next.3\n"),
      /plain/,
    );
  });
});
