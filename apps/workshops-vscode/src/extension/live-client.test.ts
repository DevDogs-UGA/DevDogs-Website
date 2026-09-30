import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { LiveClient } from "./live-client.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

async function server(port = 0) {
  const wss = new WebSocketServer({ host: "127.0.0.1", port });
  await new Promise((resolve) => wss.once("listening", resolve));
  const sockets: WebSocket[] = [];
  const received: string[] = [];
  wss.on("connection", (ws) => {
    sockets.push(ws);
    ws.on("message", (d) => received.push(d.toString()));
  });
  cleanup.push(() => wss.close());
  return { wss, sockets, received, port: (wss.address() as AddressInfo).port };
}

const until = async (check: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

function client(url: string) {
  const messages: string[] = [];
  const connection: boolean[] = [];
  const c = new LiveClient({
    url,
    onMessage: (m) => messages.push(m),
    onConnection: (up) => connection.push(up),
    backoff: { baseMs: 20, maxMs: 80 },
    random: () => 0,
  });
  cleanup.push(() => c.stop());
  return { c, messages, connection };
}

describe("LiveClient", () => {
  it("receives text and sends", async () => {
    const s = await server();
    const { c, messages, connection } = client(
      `ws://127.0.0.1:${s.port}/attend`,
    );
    c.start();
    await until(() => s.sockets.length === 1 && c.connected);
    s.sockets[0]!.send('{"t":"live","live":true}');
    await until(() => messages.length === 1);
    expect(messages[0]).toBe('{"t":"live","live":true}');
    expect(c.send('{"t":"step","step":2}')).toBe(true);
    await until(() => s.received.length === 1);
    expect(connection).toEqual([true]);
  });

  it("does not send while disconnected", () => {
    const { c } = client("ws://127.0.0.1:1/attend");
    expect(c.send("x")).toBe(false);
  });

  it("reconnects after the server drops it", async () => {
    const s = await server();
    const { c, connection } = client(`ws://127.0.0.1:${s.port}/attend`);
    c.start();
    await until(() => c.connected);
    s.sockets[0]!.terminate();
    await until(() => s.sockets.length === 2 && c.connected);
    expect(connection).toEqual([true, false, true]);
  });

  it("keeps retrying until the server is there", async () => {
    const s = await server();
    const { port } = s;
    await new Promise((r) => s.wss.close(r));
    const { c } = client(`ws://127.0.0.1:${port}/attend`);
    c.start();
    await new Promise((r) => setTimeout(r, 150));
    expect(c.connected).toBe(false);
    const again = await server(port);
    await until(() => again.sockets.length === 1);
  });

  it("stops for good", async () => {
    const s = await server();
    const { c, connection } = client(`ws://127.0.0.1:${s.port}/attend`);
    c.start();
    await until(() => c.connected);
    c.stop();
    await new Promise((r) => setTimeout(r, 200));
    expect(s.sockets.length).toBe(1);
    expect(c.connected).toBe(false);
    expect(connection).toEqual([true, false]);
  });
});
