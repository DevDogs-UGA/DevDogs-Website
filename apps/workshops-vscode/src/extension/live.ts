import * as vscode from "vscode";
import {
  afterReview,
  attendUrl,
  decideCheckpoint,
  defer,
  offerText,
  parseRelayMessage,
  prune,
  queue,
  reportableStep,
  stepMessage,
  trackOfRepo,
  type LiveTrack,
  type OfferState,
  type Step,
} from "../core/index.js";
import { LiveClient } from "./live-client.js";
import { logError, output } from "./log.js";
import { CMD, type StepsProvider } from "./panel.js";
import { fetchTags } from "./repo.js";
import type { Flow } from "./flow.js";
import type { WorkshopReviewController } from "./review-controller.js";

/**
 * "Follow live workshops": while a workshop repo is open, listens on the
 * slides relay for the presenter's checkpoints and reports the step number
 * the attendee has reached. Sockets, backoff and every decision live in
 * `live-client.ts` and `core/live.ts`; this connects them to VS Code: the
 * notification, the badge, the "● Live" view and the settings.
 *
 * What goes out is one number (see `stepMessage`). Nothing else is sent.
 */

/** Where attendees connect. `devdogsWorkshops.liveRelayUrl` overrides it (for testing). */
export const DEFAULT_RELAY_URL = "wss://slides-relay.devdogsuga.org/attend";

export const LIVE_CONTEXT = "devdogsWorkshops.live";
const REVIEW = "Review";
const LATER = "Later";

type Prompt = (message: string, ...items: string[]) => Thenable<string | undefined>;

export class LiveWorkshops implements vscode.Disposable {
  /** Shows the offer. A field so tests can answer it. */
  prompt: Prompt = (message, ...items) => vscode.window.showInformationMessage(message, ...items);

  private client: LiveClient | undefined;
  private connectedTo: string | undefined;
  private track: LiveTrack | undefined;
  private connected = false;
  private live = false;
  private sentStep: number | undefined;
  private offers: OfferState = {};
  /** The newest checkpoint seen this session, for the Live view. */
  private last: string | undefined;
  private readonly changed = new vscode.EventEmitter<undefined>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly steps: StepsProvider,
    private readonly flow: Flow,
    private readonly review: WorkshopReviewController,
    private readonly stepsView: vscode.TreeView<unknown>,
  ) {
    review.onEnded = (finished) => void this.reviewEnded(finished);
    this.disposables.push(
      this.changed,
      steps.onDidChangeTreeData(() => this.sync()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("devdogsWorkshops.followLive") || e.affectsConfiguration("devdogsWorkshops.liveRelayUrl")) {
          this.sync();
        }
      }),
    );
  }

  /** A presenter is connected (and we are). */
  get presenterLive(): boolean {
    return this.connected && this.live;
  }

  /** What's waiting for the attendee, for tests. */
  get pending(): OfferState {
    return this.offers;
  }

  /** The badge on the Workshop view, for tests. */
  get badge(): vscode.ViewBadge | undefined {
    return this.stepsView.badge;
  }

  /** The number of the step last reported, for tests. */
  get reportedStep(): number | undefined {
    return this.sentStep;
  }

  /** Backs the "● Live" view: the presenter, and the step they last finished. */
  readonly treeDataProvider: vscode.TreeDataProvider<string> = {
    onDidChangeTreeData: this.changed.event as vscode.Event<string | undefined>,
    getChildren: () => (this.presenterLive ? ["presenter", ...(this.last && this.stepOf(this.last) ? [this.last] : [])] : []),
    getTreeItem: (id) => {
      if (id === "presenter") {
        const item = new vscode.TreeItem("The presenter is live");
        item.iconPath = new vscode.ThemeIcon("broadcast", new vscode.ThemeColor("charts.red"));
        return item;
      }
      const step = this.stepOf(id)!;
      const item = new vscode.TreeItem(offerText(step).replace("Presenter finished ", ""));
      item.description = "Review";
      item.iconPath = new vscode.ThemeIcon("git-compare");
      item.command = { command: CMD.reviewToStep, title: "Review this step", arguments: [id] };
      return item;
    },
  };

  private get line(): readonly Step[] {
    return this.steps.open?.snapshot.line ?? [];
  }

  private stepOf(tag: string): Step | undefined {
    return this.line.find((s) => s.tag === tag);
  }

  /**
   * Reconciles with the settings and the open repo. Runs after every panel
   * refresh, which is also when the attendee's step may have changed (a
   * Finish, a branch switch, a merge in the terminal).
   */
  sync(): void {
    const open = this.steps.open;
    const config = vscode.workspace.getConfiguration("devdogsWorkshops");
    const track = open ? trackOfRepo(open.repo) : undefined;
    let base = config.get<string>("liveRelayUrl", "").trim() || DEFAULT_RELAY_URL;
    if (!attendUrl(base, "web")) {
      output.appendLine(`Ignoring the live relay URL "${base}": it must be ws:// or wss://.`);
      base = DEFAULT_RELAY_URL;
    }
    const target = track && config.get<boolean>("followLive", true) ? attendUrl(base, track) : undefined;

    if (target !== this.connectedTo) {
      this.client?.stop();
      this.client = undefined;
      this.connectedTo = target;
      this.track = track;
      this.setConnected(false);
      this.sentStep = undefined;
      if (target && track) {
        output.appendLine(`Following live workshops (${track}).`);
        this.client = new LiveClient({
          url: target,
          onMessage: (raw) => this.onMessage(raw),
          onConnection: (up) => this.setConnected(up),
          onError: (error) => output.appendLine(`Live relay: ${error.message}`),
        });
        this.client.start();
      }
    }

    const snapshot = open?.snapshot;
    if (snapshot) this.offers = prune(this.offers, snapshot.line, snapshot.current);
    this.report();
    this.showBadge();
  }

  private setConnected(up: boolean): void {
    this.connected = up;
    if (!up) this.live = false;
    else this.sentStep = undefined;
    void this.updateContext();
    if (up) this.report();
  }

  /** Sends the step number when it has changed since the last report. */
  private report(): void {
    const snapshot = this.steps.open?.snapshot;
    if (!snapshot || !this.client?.connected) return;
    const step = reportableStep(snapshot.line, snapshot.current);
    if (step === this.sentStep) return;
    if (this.client.send(stepMessage(step))) this.sentStep = step;
  }

  private async updateContext(): Promise<void> {
    await vscode.commands.executeCommand("setContext", LIVE_CONTEXT, this.presenterLive);
    this.changed.fire(undefined);
  }

  private onMessage(raw: string): void {
    if (!this.track) return;
    const event = parseRelayMessage(raw, this.track);
    if (!event) return;
    if (event.kind === "live") {
      this.live = event.live;
      void this.updateContext();
    } else {
      void this.onCheckpoint(event.ref).catch((error) => logError("checkpoint", error));
    }
  }

  /** The presenter finished a step. Also called directly by tests. */
  async onCheckpoint(ref: string): Promise<void> {
    let open = this.steps.open;
    if (!open) return;
    if (!open.snapshot.line.some((s) => s.tag === ref)) {
      // A tag pushed after they last fetched. Fetching only writes to .git.
      try {
        await fetchTags(open.root);
      } catch (error) {
        logError("live fetch", error);
      }
    }
    await this.steps.refresh();
    open = this.steps.open;
    if (!open) return;
    const { line, current } = open.snapshot;
    const decision = decideCheckpoint({ ref, line, current, reviewing: this.review.snapshot !== undefined });
    if (decision === "ignore") return;
    this.last = ref;
    this.changed.fire(undefined);
    if (decision === "have") {
      this.offers = prune(this.offers, line, current);
    } else if (decision === "queue") {
      this.offers = queue(this.offers, ref, line);
    } else {
      const step = line.find((s) => s.tag === ref)!;
      const choice = await this.prompt(offerText(step), REVIEW, LATER);
      if (choice === REVIEW) {
        this.offers = prune(this.offers, line, step);
        await this.flow.reviewTo(open.root, open.repo, ref);
        await this.steps.refresh();
      } else {
        // "Later", or the notification was closed.
        this.offers = defer(this.offers, ref, line);
      }
    }
    this.showBadge();
  }

  private async reviewEnded(finished: boolean): Promise<void> {
    await this.steps.refresh();
    const result = afterReview(this.offers, finished, this.line);
    this.offers = result.state;
    this.showBadge();
    if (result.offer) await this.onCheckpoint(result.offer).catch((error) => logError("checkpoint", error));
  }

  /** The badge on the Workshop view: a step they put off. */
  private showBadge(): void {
    const ref = this.offers.badge;
    const step = ref ? this.stepOf(ref) : undefined;
    this.stepsView.badge = step ? { value: 1, tooltip: offerText(step) } : undefined;
  }

  dispose(): void {
    this.client?.stop();
    this.disposables.forEach((d) => d.dispose());
  }
}
