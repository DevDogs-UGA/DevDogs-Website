// The live relay: one Durable Object that every deck's websocket connects
// to. It keeps the latest slide state (so a deck that joins or reconnects
// lands on the current slide), fans the presenter's state and checkpoints out
// to the followers, and passes the followers' checkpoint results back to the
// presenter. See theme/lib/liveProtocol.ts for the messages.
//
// The Worker in front (index.ts) decides each socket's role, after checking
// Cloudflare Access for `drive`, and passes it in the `X-Relay-Role` header.
// Uses the hibernation API, so an idle relay costs nothing between talks.
import { DurableObject } from "cloudflare:workers";
import {
  CHECKPOINT_REF,
  type DriveMessage,
  type FollowMessage,
  type RelayMessage,
  type Role,
} from "../theme/lib/liveProtocol";
import type { Track } from "../theme/lib/discord";
import {
  checkRate,
  isTrack,
  MAX_ATTENDEES,
  FLOOD_LIMIT,
  parseAttendStep,
  tallyAttendees,
  type RateState,
} from "./attend";

interface Attachment extends RateState {
  role: Role;
  track?: Track;
  // Attendees: the step number they last reported.
  step?: number;
}

// Slide state is a handful of numbers; anything this big is not from the deck.
const MAX_MESSAGE = 64 * 1024;

const STATE_KEY = "state";

// Attendee counts reach the presenter at most this often, so a room of
// people finishing a step together is one update, not a hundred.
const PEERS_DELAY_MS = 1000;

export class Relay extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket", { status: 426 });
    }
    const role = request.headers.get("X-Relay-Role") as Role;
    const track = new URL(request.url).searchParams.get("track");
    if (
      role === "attend" &&
      this.ctx.getWebSockets("attend").length >= MAX_ATTENDEES
    ) {
      return new Response("the room is full", { status: 503 });
    }
    const attachment: Attachment = {
      role,
      track: isTrack(track) ? track : undefined,
    };

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment(attachment);

    if (role === "attend") {
      this.send(server, {
        t: "live",
        live: this.ctx.getWebSockets("drive").length > 0,
      });
      await this.schedulePeers();
    } else {
      const state = this.ctx.storage.kv.get(STATE_KEY);
      if (state)
        this.send(server, {
          t: "state",
          state: state as Record<string, unknown>,
        });
      if (role === "drive")
        this.broadcast({ t: "live", live: true }, undefined, "attend");
      this.announcePeers();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const attachment = ws.deserializeAttachment() as Attachment;
    if (attachment.role === "attend")
      return this.attendMessage(ws, attachment, raw);

    if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return;
    let message: DriveMessage | FollowMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const { role } = attachment;

    if (
      role === "drive" &&
      message.t === "state" &&
      message.state &&
      typeof message.state === "object"
    ) {
      this.ctx.storage.kv.put(STATE_KEY, message.state);
      this.broadcast({ t: "state", state: message.state }, ws);
    } else if (role === "drive" && message.t === "checkpoint") {
      const tracks = Array.isArray(message.tracks)
        ? message.tracks.filter(isTrack)
        : [];
      if (
        typeof message.ref !== "string" ||
        !CHECKPOINT_REF.test(message.ref) ||
        !tracks.length
      )
        return;
      const checkpoint = {
        t: "checkpoint" as const,
        id: crypto.randomUUID(),
        ref: message.ref,
        tracks,
      };
      this.broadcast(checkpoint, undefined, "follow");
      // Each attendee gets only its own track's checkpoint.
      for (const attendee of this.ctx.getWebSockets("attend")) {
        const { track } = attendee.deserializeAttachment() as Attachment;
        if (track && tracks.includes(track)) this.send(attendee, checkpoint);
      }
    } else if (
      role === "follow" &&
      message.t === "status" &&
      isTrack(message.track)
    ) {
      const { id, ref, track, ok, message: text } = message;
      this.broadcast(
        {
          t: "status",
          id: String(id),
          ref: String(ref),
          track,
          ok: ok === true,
          message: String(text).slice(0, 500),
        },
        undefined,
        "drive",
      );
    }
  }

  // An attendee may say one thing: the step it has reached. Anything else, or
  // too much of it, is dropped, and a socket that keeps flooding is closed.
  private async attendMessage(
    ws: WebSocket,
    attachment: Attachment,
    raw: string | ArrayBuffer,
  ) {
    const rate = checkRate(attachment, Date.now());
    const next: Attachment = { ...attachment, ...rate.state };
    if (!rate.ok) {
      ws.serializeAttachment(next);
      if ((rate.state.count ?? 0) > FLOOD_LIMIT)
        ws.close(1008, "too many messages");
      return;
    }
    const step = parseAttendStep(raw);
    if (step !== undefined) next.step = step;
    ws.serializeAttachment(next);
    if (step !== undefined && step !== attachment.step)
      await this.schedulePeers();
  }

  async webSocketClose(ws: WebSocket, code: number) {
    // Code 1005 ("no status") can't be sent back.
    ws.close(code === 1005 ? 1000 : code, "closing");
    this.socketGone(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.socketGone(ws);
  }

  private async socketGone(ws: WebSocket) {
    const { role } = ws.deserializeAttachment() as Attachment;
    if (role === "attend") return this.schedulePeers();
    if (
      role === "drive" &&
      !this.ctx.getWebSockets("drive").some((other) => other !== ws)
    ) {
      this.broadcast({ t: "live", live: false }, undefined, "attend");
    }
    this.announcePeers(ws);
  }

  // Attendee counts, a moment from now (see PEERS_DELAY_MS).
  private async schedulePeers() {
    if (this.ctx.getWebSockets("drive").length === 0) return;
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now() + PEERS_DELAY_MS);
  }

  async alarm() {
    this.announcePeers();
  }

  // How many follower decks are connected, by track, so the presenter can
  // see both laptops are there before relying on them, and how many
  // attendees are in VS Code and which step each is at.
  private announcePeers(leaving?: WebSocket) {
    const peers = {
      t: "peers" as const,
      web: 0,
      mobile: 0,
      other: 0,
      attend: tallyAttendees([]),
    };
    for (const ws of this.ctx.getWebSockets("follow")) {
      if (ws === leaving) continue;
      const { track } = ws.deserializeAttachment() as Attachment;
      peers[track ?? "other"]++;
    }
    peers.attend = tallyAttendees(
      this.ctx
        .getWebSockets("attend")
        .filter((ws) => ws !== leaving)
        .map((ws) => ws.deserializeAttachment() as Attachment),
    );
    this.broadcast(peers, leaving, "drive");
  }

  private broadcast(message: RelayMessage, except?: WebSocket, role?: Role) {
    for (const ws of this.ctx.getWebSockets(role)) {
      if (ws !== except) this.send(ws, message);
    }
  }

  private send(ws: WebSocket, message: RelayMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Already closing; webSocketClose tidies up.
    }
  }
}
