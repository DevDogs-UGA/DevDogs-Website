import { describe, expect, it } from "vitest";
import {
  CallbackDeniedError,
  CallbackMalformedError,
  CallbackTimeoutError,
  StateMismatchError,
  start,
  verifyState,
} from "./loopback.js";

async function hit(port: number, query: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/callback${query}`);
}

describe("loopback listener", () => {
  it("resolves with code and state on a successful callback", async () => {
    const listener = await start();
    try {
      const response = await hit(
        listener.port,
        "?code=abc123&state=xyz789",
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Connected");
      await expect(listener.result).resolves.toEqual({
        code: "abc123",
        state: "xyz789",
      });
    } finally {
      listener.close();
    }
  });

  it("rejects with CallbackDeniedError on error=access_denied", async () => {
    const listener = await start();
    try {
      const response = await hit(
        listener.port,
        "?error=access_denied&state=xyz789",
      );
      expect(response.status).toBe(200);
      await expect(listener.result).rejects.toThrow(CallbackDeniedError);
      await expect(listener.result).rejects.toMatchObject({
        errorCode: "access_denied",
        state: "xyz789",
      });
    } finally {
      listener.close();
    }
  });

  it("rejects with CallbackMalformedError when neither code nor error is present", async () => {
    const listener = await start();
    try {
      const response = await hit(listener.port, "?state=xyz789");
      expect(response.status).toBe(400);
      await expect(listener.result).rejects.toThrow(CallbackMalformedError);
    } finally {
      listener.close();
    }
  });

  it("rejects with CallbackTimeoutError when nothing ever arrives", async () => {
    const listener = await start({ timeoutMs: 20 });
    try {
      await expect(listener.result).rejects.toThrow(CallbackTimeoutError);
    } finally {
      listener.close();
    }
  });

  it("closes the underlying server once settled — a later request cannot connect", async () => {
    const listener = await start();
    await hit(listener.port, "?code=abc&state=xyz");
    await listener.result;

    await expect(hit(listener.port, "?code=abc&state=xyz")).rejects.toThrow();
  });

  it("close() is safe to call more than once", async () => {
    const listener = await start();
    listener.close();
    expect(() => listener.close()).not.toThrow();
  });

  it("close() before any request rejects nothing further and frees the port", async () => {
    const listener = await start();
    listener.close();
    // Give the event loop a tick — the server really did stop listening.
    await expect(hit(listener.port, "?code=abc&state=xyz")).rejects.toThrow();
  });

  it("every listener gets its own ephemeral port", async () => {
    const a = await start();
    const b = await start();
    try {
      expect(a.port).not.toBe(b.port);
    } finally {
      a.close();
      b.close();
    }
  });

  it("end to end: a callback whose state does not match the generated one is rejected", async () => {
    const listener = await start();
    try {
      const generatedState = "expected-state-123";
      // The browser (or an attacker) hits the loopback callback with a
      // DIFFERENT state than the one this run generated and put in the
      // connect URL — the CSRF case `verifyState` exists to catch.
      await hit(listener.port, "?code=abc123&state=forged-state-999");
      const callback = await listener.result;

      expect(() => verifyState(generatedState, callback)).toThrow(
        StateMismatchError,
      );
    } finally {
      listener.close();
    }
  });
});

describe("verifyState", () => {
  it("returns the callback unchanged when state matches", () => {
    const callback = { code: "abc", state: "s" };
    expect(verifyState("s", callback)).toBe(callback);
  });

  it("throws StateMismatchError when state does not match", () => {
    expect(() => verifyState("expected", { code: "abc", state: "different" })).toThrow(
      StateMismatchError,
    );
  });
});
