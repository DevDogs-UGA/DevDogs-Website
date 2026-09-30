import WebSocket from "ws";
import { backoffDelay, type Backoff } from "../core/index.js";

/**
 * One websocket to the relay, kept open: reconnects with exponential backoff
 * and jitter, and never throws. No vscode in here, so it is tested against a
 * local server. (`ws`, bundled: Node 20, which VS Code 1.93 ships, has no
 * global WebSocket without a flag.)
 */

export interface LiveClientOptions {
  url: string;
  onMessage(raw: string): void;
  /** Called when the socket opens or closes. */
  onConnection(connected: boolean): void;
  onError?(error: Error): void;
  backoff?: Backoff;
  random?: () => number;
}

export class LiveClient {
  private socket: WebSocket | undefined;
  private timer: NodeJS.Timeout | undefined;
  private attempt = 0;
  private stopped = true;

  constructor(private readonly options: LiveClientOptions) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.removeAllListeners();
      socket.on("error", () => {});
      const wasOpen = socket.readyState === WebSocket.OPEN;
      socket.terminate();
      if (wasOpen) this.options.onConnection(false);
    }
  }

  /** Sends `text` if connected; false when there is no connection (nothing is queued). */
  send(text: string): boolean {
    if (!this.connected) return false;
    this.socket!.send(text);
    return true;
  }

  private open(): void {
    const socket = new WebSocket(this.options.url, {
      maxPayload: 64 * 1024,
      handshakeTimeout: 15_000,
    });
    this.socket = socket;
    let opened = false;
    socket.on("open", () => {
      opened = true;
      this.attempt = 0;
      this.options.onConnection(true);
    });
    socket.on("message", (data, isBinary) => {
      if (!isBinary) this.options.onMessage(data.toString());
    });
    socket.on("error", (error) => this.options.onError?.(error));
    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (opened) this.options.onConnection(false); // a failed attempt is not news
      if (this.stopped) return;
      const delay = backoffDelay(
        this.attempt++,
        this.options.random,
        this.options.backoff,
      );
      this.timer = setTimeout(() => this.open(), delay);
    });
  }
}
