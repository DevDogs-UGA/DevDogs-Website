import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs/promises to verify file permissions are set correctly.
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(async () => undefined),
  chmod: vi.fn(async () => undefined),
}));

import { chmod, writeFile } from "node:fs/promises";
import { EnvDocument } from "./document.js";
import { save } from "./files.js";

describe("save", () => {
  beforeEach(() => {
    vi.mocked(writeFile).mockClear();
    vi.mocked(chmod).mockClear();
  });

  it("writes env files with restrictive permissions (0o600)", async () => {
    const doc = EnvDocument.empty();
    doc.set("TEST_SECRET", "secret_value", {
      environment: "staging",
      action: "pulled",
      date: "2026-09-21",
    });

    await save("/path/to/.env.staging", doc);

    // writeFile called with mode 0o600 to restrict permissions on creation
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      "/path/to/.env.staging",
      expect.any(String),
      { mode: 0o600 },
    );

    // chmod called to tighten existing world-readable files
    expect(vi.mocked(chmod)).toHaveBeenCalledWith(
      "/path/to/.env.staging",
      0o600,
    );
  });
});
