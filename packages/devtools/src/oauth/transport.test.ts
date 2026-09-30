import { describe, expect, it } from "vitest";
import { decideTransport, detectRemoteEnvironmentReason } from "./transport.js";

describe("detectRemoteEnvironmentReason", () => {
  it("returns null in a plain local environment", () => {
    expect(detectRemoteEnvironmentReason({})).toBeNull();
  });

  it("detects SSH via SSH_CONNECTION", () => {
    expect(
      detectRemoteEnvironmentReason({ SSH_CONNECTION: "1.2.3.4 1 5.6.7.8 22" }),
    ).toMatch(/SSH/);
  });

  it("detects SSH via SSH_TTY", () => {
    expect(detectRemoteEnvironmentReason({ SSH_TTY: "/dev/pts/0" })).toMatch(
      /SSH/,
    );
  });

  it("detects a GitHub Codespace", () => {
    expect(detectRemoteEnvironmentReason({ CODESPACES: "true" })).toMatch(
      /Codespace/,
    );
  });

  it("does not treat CODESPACES=false as remote", () => {
    expect(detectRemoteEnvironmentReason({ CODESPACES: "false" })).toBeNull();
  });

  it("detects a dev container via REMOTE_CONTAINERS", () => {
    expect(
      detectRemoteEnvironmentReason({ REMOTE_CONTAINERS: "true" }),
    ).toMatch(/dev container/);
  });

  it("detects a dev container via DEVCONTAINER", () => {
    expect(detectRemoteEnvironmentReason({ DEVCONTAINER: "true" })).toMatch(
      /dev container/,
    );
  });
});

describe("decideTransport", () => {
  it("defaults to loopback with no override and no remote environment", () => {
    expect(decideTransport({ env: {} })).toEqual({
      transport: "loopback",
      reason: "no remote environment detected",
    });
  });

  it("auto-selects device when a remote environment is detected", () => {
    const decision = decideTransport({ env: { SSH_TTY: "/dev/pts/0" } });
    expect(decision.transport).toBe("device");
    expect(decision.reason).toMatch(/detected/);
  });

  it("--device forces device even with no remote environment detected", () => {
    const decision = decideTransport({ forceDevice: true, env: {} });
    expect(decision).toEqual({
      transport: "device",
      reason: "--device was passed",
    });
  });

  it("--loopback forces loopback even inside a detected SSH session", () => {
    const decision = decideTransport({
      forceLoopback: true,
      env: { SSH_TTY: "/dev/pts/0" },
    });
    expect(decision).toEqual({
      transport: "loopback",
      reason: "--loopback was passed",
    });
  });

  it("an explicit override always wins over auto-detection", () => {
    const decision = decideTransport({
      forceDevice: true,
      env: { SSH_TTY: "/dev/pts/0" },
    });
    expect(decision.transport).toBe("device");
    expect(decision.reason).toBe("--device was passed");
  });
});
