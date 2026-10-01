/**
 * `pnpm backstage newsletter render|draft|send <issue…>`
 *
 * The DevDogs Changelog, from the issues published in `@devdogsuga/newsletter`:
 *
 *   * `render`: writes `.eml` and `.html` files and touches nothing else.
 *   * `draft`: appends each issue to the Drafts folder of the club mailbox
 *     over IMAP, for review in any Outlook.
 *   * `send`: submits each issue over SMTP, byte for byte as authored, to the
 *     recipients named with `--to`. There is no default audience, and every
 *     send asks first, naming the issue and the full recipient list.
 *
 * Drafts and sends always use the club mailbox. Sending goes through SMTP and
 * not Outlook because Outlook's composers rewrite the HTML: they strip the
 * styles, classes and `bgcolor` attributes the dark-mode defences rely on.
 *
 * Credentials: none stored for you to manage. The first `draft` or `send`
 * opens a browser to sign in as the club mailbox (see `oauth.ts`); the
 * refresh token is cached outside any repository, so later runs, including
 * non-interactive ones, reuse it. No env file and no checkout.
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  confirm,
  log,
  multiselect,
  spinner,
  text as askText,
} from "@clack/prompts";
import { ISSUES, issueByVersion } from "@devdogsuga/newsletter";
import {
  buildEml,
  emailImages,
  previewRenderContext,
  renderIssueDocument,
} from "@devdogsuga/newsletter/export";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isNonInteractive } from "@devdogsuga/cli-core/mode";
import {
  errorMessage,
  explainError,
  unwrap,
  UsageError,
} from "@devdogsuga/cli-core/ui";
import { appendDraft } from "./imap.js";
import { rasterize } from "./images.js";
import { openInBrowser, startLoopback, type Loopback } from "./loopback.js";
import {
  authorizeUrl,
  codeFromRedirect,
  grantPath,
  PASTE_REDIRECT_URI,
  readGrant,
  redeemCode,
  refreshTokens,
  writeGrant,
  type MailboxTokens,
} from "./oauth.js";
import { originationHeaders, submitMessage } from "./smtp.js";

/** The account every draft and send goes through. There is no override. */
export const CLUB_MAILBOX = "devdogs@uga.edu";

export const NEWSLETTER_FORMATS = ["eml", "html"] as const;
export type NewsletterFormat = (typeof NEWSLETTER_FORMATS)[number];

export const SUBCOMMANDS = ["render", "draft", "send"] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

export interface NewsletterOptions {
  subcommand: Subcommand;
  /** Issue versions as typed; `*` stands for all of them. Empty means ask. */
  versions: string[];
  /** `render` only. */
  formats: NewsletterFormat[];
  /** `render` only: the directory the files go to. */
  out: string;
  /** `send` only: the full recipient list. */
  to: string[];
  /** Answers the send confirmation. */
  yes: boolean;
}

function expandHome(value: string): string {
  return value === "~" || value.startsWith("~/")
    ? resolve(homedir(), value.slice(2))
    : value;
}

function commaList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Reads one subcommand's arguments, or throws a {@link UsageError} saying what is wrong. */
export function parseNewsletterArgs(
  argv: readonly string[],
  cwd: string,
): NewsletterOptions {
  const [subcommand, ...rest] = argv;
  if (!subcommand || !(SUBCOMMANDS as readonly string[]).includes(subcommand)) {
    throw new UsageError(
      subcommand
        ? `Unknown newsletter command "${subcommand}". Try ${SUBCOMMANDS.join(", ")}.`
        : `Name what to do: ${SUBCOMMANDS.join(", ")}.`,
    );
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        format: { type: "string" },
        out: { type: "string" },
        to: { type: "string" },
        yes: { type: "boolean" },
        // Handled by the launcher and the dispatcher.
        "dry-run": { type: "boolean" },
      },
      allowPositionals: true,
    });
  } catch (err) {
    throw new UsageError(
      `${errorMessage(err)} (There is no --mailbox: the club mailbox is always used.)`,
    );
  }
  const { values } = parsed;

  const wrongSubcommand = (flag: string, belongsTo: Subcommand): void => {
    if (
      values[flag as keyof typeof values] !== undefined &&
      subcommand !== belongsTo
    ) {
      throw new UsageError(`--${flag} belongs to \`newsletter ${belongsTo}\`.`);
    }
  };
  wrongSubcommand("format", "render");
  wrongSubcommand("out", "render");
  wrongSubcommand("to", "send");

  const to = commaList(values.to);
  if (subcommand === "send") {
    // A send names its recipients in the same breath: there is no default
    // audience, and nothing is prompted for.
    if (!to.length) {
      throw new UsageError(
        "`newsletter send` needs --to, a comma-separated list of addresses.",
      );
    }
    const notAddresses = to.filter((value) => !value.includes("@"));
    if (notAddresses.length) {
      throw new UsageError(
        `--to takes email addresses, not ${notAddresses.join(", ")}.`,
      );
    }
  }

  // Both formats by default: the .eml is the point of rendering, and the .html
  // is how it gets proofread before an officer opens Outlook.
  const formats = commaList(values.format ?? "eml,html");
  const bad = formats.filter(
    (value) => !(NEWSLETTER_FORMATS as readonly string[]).includes(value),
  );
  if (bad.length) {
    throw new UsageError(`Unknown format ${bad.join(", ")}. Try eml or html.`);
  }

  return {
    subcommand: subcommand as Subcommand,
    // Versions can only be checked against the published issues, which the run
    // does; they pass through here unchecked.
    versions: parsed.positionals,
    formats: [...new Set(formats)] as NewsletterFormat[],
    out: resolve(cwd, expandHome(values.out ?? "changelog-exports")),
    to,
    yes: values.yes === true,
  };
}

export function destination(
  out: string,
  version: string,
  format: NewsletterFormat,
): string {
  return resolve(out, `changelog-v${version}.${format}`);
}

/** The confirmation text for a send: the issues and every recipient. */
export function sendSummary(
  versions: readonly string[],
  to: readonly string[],
): string {
  const issues = versions.map((version) => `v${version}`).join(", ");
  return `Send ${issues} from ${CLUB_MAILBOX} to ${to.length} recipient${to.length === 1 ? "" : "s"}: ${to.join(", ")}?`;
}

/**
 * Asks before a send, every time. `--yes` answers it; with no terminal it is
 * the only way through, so an unattended run cannot send by accident.
 */
async function confirmSend(
  options: NewsletterOptions,
  versions: readonly string[],
): Promise<boolean> {
  if (options.yes) return true;
  if (isNonInteractive()) {
    throw new UsageError(
      `${sendSummary(versions, options.to)} No terminal to ask. Pass --yes to send.`,
    );
  }
  return unwrap(
    await confirm({
      message: sendSummary(versions, options.to),
      initialValue: false,
    }),
  );
}

async function pickIssues(): Promise<string[]> {
  if (isNonInteractive()) {
    throw new UsageError(
      "No terminal to choose issues. Name one, or pass * for all.",
    );
  }
  return unwrap(
    await multiselect({
      message: "Which issues?",
      options: ISSUES.map((issue) => ({
        value: issue.version,
        label: `v${issue.version}`,
        hint: issue.tagline,
      })),
      initialValues: [ISSUES[ISSUES.length - 1]?.version ?? ""].filter(Boolean),
      required: true,
    }),
  );
}

/**
 * The browser sign-in, redirect caught by a loopback server: open the URL,
 * wait for the code to knock, exchange it. Five minutes is the patience —
 * authorization codes do not live much longer anyway.
 */
async function signInViaLoopback(
  server: Loopback,
  state: string,
): Promise<MailboxTokens> {
  const redirectUri = `http://localhost:${server.port}/`;
  const url = authorizeUrl(CLUB_MAILBOX, redirectUri, state);
  log.step(
    `Sign in as ${CLUB_MAILBOX} in the browser window that just opened:`,
  );
  log.message(url);
  openInBrowser(url);
  const wait = spinner();
  wait.start("Waiting for the sign-in to come back");
  try {
    const timeout = new Promise<never>((_, rejectLate) => {
      setTimeout(
        () =>
          rejectLate(
            new Error("Five minutes passed with no sign-in. Run it again."),
          ),
        5 * 60_000,
      ).unref();
    });
    const code = await Promise.race([server.code, timeout]);
    wait.stop("The sign-in came back.");
    return await redeemCode(code, redirectUri);
  } catch (err) {
    wait.stop("No sign-in.");
    throw err;
  } finally {
    server.close();
  }
}

/** The pasted fallback for a machine where no local port would bind. */
async function signInViaPaste(): Promise<MailboxTokens> {
  log.step(`Open this and sign in as ${CLUB_MAILBOX}:`);
  log.message(authorizeUrl(CLUB_MAILBOX, PASTE_REDIRECT_URI));
  const pasted = unwrap(
    await askText({
      message:
        "The browser will land on a dead localhost page. Paste its full address:",
      validate: (value) => {
        const code = codeFromRedirect(value ?? "");
        return code instanceof Error ? code.message : undefined;
      },
    }),
  );
  const code = codeFromRedirect(pasted);
  if (code instanceof Error) throw code;
  return redeemCode(code, PASTE_REDIRECT_URI);
}

/**
 * An access token for the club mailbox: the stored grant refreshed when there
 * is one, a browser sign-in when there is not.
 */
async function mailboxAccessToken(): Promise<string> {
  const stored = await readGrant();
  if (stored?.mailbox === CLUB_MAILBOX) {
    try {
      const tokens = await refreshTokens(stored.refreshToken);
      // Microsoft rotates refresh tokens; keeping the old one means the next
      // run signs in from scratch.
      await writeGrant({
        mailbox: CLUB_MAILBOX,
        refreshToken: tokens.refreshToken,
      });
      return tokens.accessToken;
    } catch (err) {
      log.warn(`The stored sign-in was refused (${errorMessage(err)}).`);
    }
  }
  if (isNonInteractive()) {
    throw new UsageError(
      `No terminal to sign in as ${CLUB_MAILBOX}. Run \`pnpm backstage newsletter draft <issue>\` interactively once; after that this works anywhere.`,
    );
  }
  const state = randomBytes(16).toString("hex");
  const server = await startLoopback(state).catch(() => null);
  const tokens = server
    ? await signInViaLoopback(server, state)
    : await signInViaPaste();
  await writeGrant({
    mailbox: CLUB_MAILBOX,
    refreshToken: tokens.refreshToken,
  });
  log.info(
    `Signed in. The grant lives in ${grantPath()} — mode 600, keep it that way.`,
  );
  return tokens.accessToken;
}

/** The email's marks, rasterised once: they are the same in every issue. */
async function attachments() {
  return Promise.all(
    emailImages().map(async (image) => ({
      cid: image.cid,
      filename: image.filename,
      contentType: "image/png",
      base64: (await rasterize(image.svg, image.rasterWidth)).toString(
        "base64",
      ),
    })),
  );
}

export async function runNewsletter(argv: string[]): Promise<void> {
  try {
    await newsletter(parseNewsletterArgs(argv, process.cwd()));
  } catch (err) {
    explainError("Could not do that.", err, [
      "pnpm backstage newsletter render '*' --out ~/changelog",
      "pnpm backstage newsletter draft 3.0.1",
      "pnpm backstage newsletter send 3.0.1 --to a@uga.edu,b@uga.edu",
    ]);
    process.exitCode = 1;
  }
}

async function newsletter(parsed: NewsletterOptions): Promise<void> {
  const unknown = parsed.versions.filter(
    (version) => version !== "*" && !issueByVersion(version),
  );
  if (unknown.length) {
    throw new UsageError(
      `No issue called ${unknown.join(", ")}. Try ${ISSUES.map((issue) => issue.version).join(", ")}, or *.`,
    );
  }

  const chosen = parsed.versions.length ? parsed.versions : await pickIssues();
  const versions = chosen.includes("*")
    ? ISSUES.map((issue) => issue.version)
    : [...new Set(chosen)];

  if (parsed.subcommand === "render") {
    const images = parsed.formats.includes("eml") ? await attachments() : [];
    const written: string[] = [];
    for (const version of versions) {
      const issue = issueByVersion(version)!;
      for (const format of parsed.formats) {
        const file = destination(parsed.out, version, format);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(
          file,
          format === "eml"
            ? buildEml({
                subject: issue.title,
                html: renderIssueDocument(issue),
                images,
              })
            : renderIssueDocument(issue, previewRenderContext()),
        );
        written.push(file);
      }
    }
    for (const file of written) log.success(file);
    log.info(
      `${written.length} file${written.length === 1 ? "" : "s"} written. An .eml opens in classic Outlook for review; send with \`newsletter send\`.`,
    );
    return;
  }

  // Asked before anything is rasterised or signed in, so a "no" costs nothing.
  if (parsed.subcommand === "send" && !(await confirmSend(parsed, versions))) {
    log.info("Nothing sent.");
    return;
  }

  const images = await attachments();
  const message = (version: string): string => {
    const issue = issueByVersion(version)!;
    return buildEml({
      subject: issue.title,
      html: renderIssueDocument(issue),
      images,
      unsent: false,
    });
  };
  const accessToken = await mailboxAccessToken();

  if (parsed.subcommand === "draft") {
    for (const version of versions) {
      await appendDraft({
        user: CLUB_MAILBOX,
        accessToken,
        message: message(version),
      });
      log.success(`v${version} → Drafts of ${CLUB_MAILBOX}`);
    }
    log.info(
      "Open any Outlook as the club account to review, but send with " +
        "`newsletter send`, not from Outlook: its composers rewrite the HTML.",
    );
    return;
  }

  for (const version of versions) {
    await submitMessage({
      user: CLUB_MAILBOX,
      accessToken,
      from: CLUB_MAILBOX,
      recipients: parsed.to,
      message: originationHeaders(CLUB_MAILBOX, parsed.to) + message(version),
    });
    log.success(`v${version} → sent to ${parsed.to.join(", ")}`);
  }
}

export const handleNewsletter: CommandHandler = async (rest) => {
  await runNewsletter(rest);
  return process.exitCode ? null : DONE;
};
