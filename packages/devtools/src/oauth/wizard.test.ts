/**
 * `connectViaOneClick` is the one piece of `wizard.ts` worth a focused unit
 * test on its own: TASK-352 review flagged that its try/catch around
 * starting the loopback listener must not ALSO catch failures that happen
 * after the listener is already up (which are `connectOneClick`'s own, and
 * must propagate — or `bail()` — unchanged, never be mistaken for "the
 * listener never started" and silently rerouted to the device flow). These
 * three tests pin that boundary directly, mocking only `loopback.js`'s
 * `start`, `browser.js`'s `openBrowser`, and `device.js`'s
 * `requestDeviceCode`/`pollForToken` — everything else in the one-click path
 * (`@clack/prompts`' non-interactive `log`/`note`/`spinner`) runs for real.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectTarget } from "./target.js";

const { startLoopbackMock, requestDeviceCodeMock, pollForTokenMock } = vi.hoisted(() => ({
  startLoopbackMock: vi.fn(),
  requestDeviceCodeMock: vi.fn(),
  pollForTokenMock: vi.fn(),
}));

vi.mock("./browser.js", () => ({ openBrowser: vi.fn() }));

vi.mock("./loopback.js", async () => {
  const actual = await vi.importActual<typeof import("./loopback.js")>("./loopback.js");
  return { ...actual, start: startLoopbackMock };
});

vi.mock("./device.js", async () => {
  const actual = await vi.importActual<typeof import("./device.js")>("./device.js");
  return {
    ...actual,
    requestDeviceCode: requestDeviceCodeMock,
    pollForToken: pollForTokenMock,
  };
});

const { connectViaOneClick } = await import("./wizard.js");

const target: ConnectTarget = {
  apiUrl: "http://127.0.0.1:54321",
  serviceRoleKey: "service-role-key",
  kind: "local",
};
const platformUrl = "https://devdogsuga.org";
const cwd = "/tmp";

const deviceCodeResult = {
  deviceCode: "devcode-1",
  userCode: "ABCD-EFGH",
  verificationUri: "https://devdogsuga.org/device",
  verificationUriComplete: "https://devdogsuga.org/device?user_code=ABCD-EFGH",
  expiresIn: 900,
  interval: 5,
};
const exchangeResult = { clientId: "cid", clientSecret: "csecret", issuer: "iss" };

describe("connectViaOneClick", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("falls back to the device flow when the loopback listener fails to start", async () => {
    // No SSH/Codespace/devcontainer signal — auto-detection alone would
    // pick loopback; this proves the fallback triggers on the START
    // failure itself, not on environment detection.
    startLoopbackMock.mockRejectedValueOnce(new Error("EACCES: permission denied"));
    requestDeviceCodeMock.mockResolvedValueOnce(deviceCodeResult);
    pollForTokenMock.mockResolvedValueOnce(exchangeResult);

    const result = await connectViaOneClick(target, platformUrl, cwd, undefined);

    expect(result).toEqual(exchangeResult);
    expect(requestDeviceCodeMock).toHaveBeenCalledTimes(1);
  });

  it("propagates a loopback start failure unchanged when --loopback was forced", async () => {
    startLoopbackMock.mockRejectedValueOnce(new Error("EACCES: permission denied"));

    await expect(
      connectViaOneClick(target, platformUrl, cwd, "loopback"),
    ).rejects.toThrow("EACCES: permission denied");
    expect(requestDeviceCodeMock).not.toHaveBeenCalled();
  });

  it("does not fall back to device for a failure after the listener has already started", async () => {
    const listenerResult = Promise.reject(new Error("boom"));
    listenerResult.catch(() => {});
    const close = vi.fn();
    startLoopbackMock.mockResolvedValueOnce({
      port: 54999,
      redirectUri: "http://127.0.0.1:54999/callback",
      result: listenerResult,
      close,
    });

    await expect(
      connectViaOneClick(target, platformUrl, cwd, undefined),
    ).rejects.toThrow("boom");

    // The failure happened AFTER the listener started, so this must be
    // `connectOneClick`'s own failure, not a device-flow fallback — and the
    // listener it started must still be closed.
    expect(requestDeviceCodeMock).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
