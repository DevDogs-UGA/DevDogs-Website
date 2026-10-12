/**
 * `devtools moderation send|samples`.
 *
 * The same signed messages the platform's delivery queue sends, from a
 * terminal. Pointed at a receiver on local Docker, it is how an app's
 * `platform-moderation` Edge Function and its `apply_event` are developed and
 * checked without a platform, a queue or a moderator.
 */
import { flagValue, positionals } from "@devdogsuga/cli-core/args";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { explain } from "@devdogsuga/cli-core/ui";
import {
  MESSAGE_TYPES,
  SAMPLE_SECRET,
  buildMessage,
  signMessage,
  signedSamples,
  type MessageType,
} from "@devdogsuga/sdk/moderation";

export const DEFAULT_RECEIVER =
  "http://127.0.0.1:54321/functions/v1/platform-moderation";

export function isMessageType(value: string): value is MessageType {
  return (MESSAGE_TYPES as readonly string[]).includes(value);
}

interface Target {
  url: string;
  secret: string;
  usingSampleSecret: boolean;
}

function target(rest: string[]): Target {
  const secret =
    flagValue(rest, "--secret") ?? process.env.PLATFORM_MODERATION_SECRET;
  return {
    url: flagValue(rest, "--to") ?? DEFAULT_RECEIVER,
    secret: secret ?? SAMPLE_SECRET,
    usingSampleSecret: secret === undefined,
  };
}

export interface Reply {
  status: number;
  body: string;
}

/** POSTs a signed body. A refused connection says what to start, not a stack. */
export async function post(
  { url, secret }: Target,
  body: string,
  options: { id?: string; timestamp?: number } = {},
  doFetch: typeof fetch = fetch,
): Promise<Reply> {
  const headers = await signMessage(secret, body, options);
  const response = await doFetch(url, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body,
  });
  return { status: response.status, body: await response.text() };
}

/** The outcome word a reference-shaped receiver answers with, if it does. */
function outcomeOf(reply: Reply): string | null {
  try {
    const parsed = JSON.parse(reply.body) as { outcome?: unknown };
    return typeof parsed.outcome === "string" ? parsed.outcome : null;
  } catch {
    return null;
  }
}

function show(label: string, reply: Reply): void {
  const outcome = outcomeOf(reply);
  process.stdout.write(
    `${label}: HTTP ${reply.status}${outcome ? ` (${outcome})` : ""}${
      reply.status >= 400 && reply.body ? ` ${reply.body.slice(0, 200)}` : ""
    }\n`,
  );
}

function unreachable(url: string, error: unknown): void {
  explain(
    `Could not reach ${url}.`,
    error instanceof Error ? error.message : String(error),
    [
      "Start your local stack (`supabase start`) and serve the function (`supabase functions serve`),",
      "or pass --to <url> for a receiver running somewhere else.",
    ],
  );
  process.exitCode = 1;
}

function noteSecret(t: Target): void {
  if (t.usingSampleSecret) {
    process.stderr.write(
      "Signing with the sample secret. Set your receiver's secret to it, or pass --secret / PLATFORM_MODERATION_SECRET.\n",
    );
  }
}

export async function runSend(rest: string[]): Promise<void> {
  const action = positionals(rest)[1];
  if (!action || !isMessageType(action)) {
    explain(
      action ? `"${action}" is not a moderation action.` : "Which action?",
      "",
      [`devtools moderation send <${MESSAGE_TYPES.join(" | ")}>`],
    );
    process.exitCode = 1;
    return;
  }

  const t = target(rest);
  noteSecret(t);
  const stale = rest.includes("--stale");
  const message = buildMessage({
    type: action,
    timestamp: new Date(Date.now() - (stale ? 60_000 : 0)).toISOString(),
    contentType: flagValue(rest, "--content-type"),
    contentRef: flagValue(rest, "--content-ref"),
    userId: flagValue(rest, "--user"),
  });
  const body = JSON.stringify(message);
  const id = `msg_${crypto.randomUUID()}`;

  try {
    const first = await post(t, body, { id });
    show(`${action}`, first);
    if (first.status >= 300) process.exitCode = 1;
    if (rest.includes("--replay")) {
      const second = await post(t, body, { id });
      show(`${action} (replay)`, second);
      if (second.status >= 300) process.exitCode = 1;
    }
  } catch (error) {
    unreachable(t.url, error);
  }
}

export async function runSamples(
  rest: string[],
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  const t = target(rest);
  noteSecret(t);
  let allPassed = true;
  try {
    for (const sample of await signedSamples({ secret: t.secret })) {
      const response = await doFetch(t.url, {
        method: "POST",
        headers: { ...sample.headers, "content-type": "application/json" },
        body: sample.body,
      });
      const reply: Reply = {
        status: response.status,
        body: await response.text(),
      };
      const outcome = outcomeOf(reply);
      const passed = reply.status < 300 && outcome === sample.expected;
      // A receiver that acknowledges without naming an outcome cannot be
      // checked from outside: it is reported, not failed.
      const verdict = passed
        ? "ok"
        : reply.status < 300 && outcome === null
          ? "answered 2xx (no outcome to check)"
          : `expected ${sample.expected}, got HTTP ${reply.status}${outcome ? ` (${outcome})` : ""}`;
      process.stdout.write(
        `${passed ? "pass" : "FAIL"}  ${sample.name}: ${verdict}\n`,
      );
      if (!passed && !(reply.status < 300 && outcome === null))
        allPassed = false;
    }
  } catch (error) {
    unreachable(t.url, error);
    return false;
  }
  if (!allPassed) process.exitCode = 1;
  return allPassed;
}

export const handleModeration: CommandHandler = async (rest) => {
  const sub = positionals(rest)[0];
  if (sub === "send") await runSend(rest);
  else if (sub === "samples") await runSamples(rest);
  else {
    process.stderr.write(
      `devtools moderation: unknown subcommand "${sub ?? "(none)"}". Expected: send or samples.\n`,
    );
    process.exitCode = 1;
  }
  return process.exitCode ? null : DONE;
};
