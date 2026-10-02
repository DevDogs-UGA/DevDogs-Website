import {
  ID_PATTERN,
  MEETING_CANCELLATION_REASON_MAX_LENGTH,
  MEETING_SUMMARY_MAX_LENGTH,
  MEETING_TITLE_MAX_LENGTH,
  RSVP_URL_ALLOWED_HOSTS,
  RSVP_URL_PATTERN,
  WORKSHOP_DESCRIPTION_MAX_LENGTH,
  WORKSHOP_TITLE_MAX_LENGTH,
  type ClubConfig,
  type Meeting,
  type Workshop,
} from "./schema.js";
import type { QuestionsConfig } from "./questions.js";

/**
 * Publishability rules: lengths, the RSVP-host allowlist, cancellation
 * reason/date pairing, id uniqueness and shape. There is no such thing as a
 * half-typed row here. A config file either parses and validates whole, or
 * CI fails the merge -- there is no "officer is still mid-edit" state to stay
 * silent about, because nothing reaches `main` until it is complete. So a
 * REFUSAL (a value that arrived and cannot be published) and a STATE (a row
 * that is merely unfinished) are not different things here: every finding
 * below is a hard error.
 *
 * Deliberately pure: no filesystem, no network, no database. Takes an
 * already-parsed `ClubConfig` and returns every problem it can find, rather
 * than stopping at the first one -- an author fixing one issue at a time off
 * a truncated report is the exact frustration the old refusal messages were
 * written to end.
 */

export interface ValidationIssue {
  /** Which meeting or workshop this finding is about, by its authored id. */
  id: string;
  /** Machine-readable, for tests and for `check.ts`'s exit-code decision. */
  code: ValidationIssueCode;
  /** A human-readable explanation, in the same voice the old refusal
   * messages used: what is wrong, and why it matters. */
  message: string;
}

export type ValidationIssueCode =
  | "duplicate_id"
  | "invalid_id"
  | "meeting_title_too_long"
  | "meeting_summary_too_long"
  | "meeting_cancellation_reason_too_long"
  | "meeting_cancellation_reason_without_date"
  | "meeting_rsvp_host"
  | "workshop_title_too_long"
  | "workshop_description_too_long"
  | "duplicate_question_id"
  | "duplicate_option_id"
  | "member_question_prefill"
  | "unknown_question"
  | "member_question_listed"
  | "question_listed_twice";

/**
 * `questions` is `questions.json`, checked on its own and against the
 * meetings that list its questions. Without it (a caller with only the
 * meetings), the meetings are checked alone.
 */
export function validateClubConfig(
  config: ClubConfig,
  questions?: QuestionsConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkIdsUnique(config, issues);

  for (const meeting of config.meetings) {
    checkMeeting(meeting, issues);
    for (const workshop of meeting.agenda) {
      checkWorkshop(workshop, issues);
    }
  }

  if (questions) checkQuestions(questions, config.meetings, issues);

  return issues;
}

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * Every id -- a meeting's or a workshop's -- has to be unique across the
 * WHOLE config, not merely within its own list. The reconcile matches rows
 * onto meetings and workshops by `configId` alone, with no table qualifier in
 * the lookup, so a meeting and a workshop sharing an id would be genuinely
 * ambiguous rather than merely confusing.
 *
 * `ID_PATTERN` is checked by the schema already (`stableId`'s `.regex()`),
 * which only runs when the shape otherwise parses. This function assumes it
 * has already been called on a value that reached here as a plain string, so
 * it re-checks the pattern rather than trusting the caller -- `check.ts` may
 * hand this raw JSON that skipped the schema in a future caller, and a
 * validator that trusts its input is the harder bug to find.
 */
function checkIdsUnique(config: ClubConfig, issues: ValidationIssue[]): void {
  const seen = new Map<string, "meeting" | "workshop">();

  const visit = (id: string, kind: "meeting" | "workshop") => {
    if (!ID_PATTERN.test(id)) {
      issues.push({
        id,
        code: "invalid_id",
        message:
          `"${id}" is not a valid id -- ids are letters, digits and dashes ` +
          "only, with no leading or trailing dash.",
      });
    }
    const owner = seen.get(id);
    if (owner !== undefined) {
      issues.push({
        id,
        code: "duplicate_id",
        message:
          `"${id}" is used by more than one ${owner === kind ? kind : "item"} ` +
          "in this config. Every meeting and workshop id must be unique " +
          "across the whole file -- the reconcile matches rows onto this id " +
          "alone.",
      });
      return;
    }
    seen.set(id, kind);
  };

  for (const meeting of config.meetings) {
    visit(meeting.id, "meeting");
    for (const workshop of meeting.agenda) visit(workshop.id, "workshop");
  }
}

// ── Meetings ─────────────────────────────────────────────────────────────────

function checkMeeting(meeting: Meeting, issues: ValidationIssue[]): void {
  // The length caps are already enforced by the schema's `.max()` calls --
  // a config that violates them fails to PARSE, and `check.ts` never reaches
  // this function with one. They are re-asserted here anyway, defensively,
  // because this validator's contract is "call it on any parsed ClubConfig",
  // and a future caller that relaxes the schema without reading this file
  // must not silently lose the check.
  if (meeting.title.length > MEETING_TITLE_MAX_LENGTH) {
    issues.push({
      id: meeting.id,
      code: "meeting_title_too_long",
      message: `Title is ${meeting.title.length} characters; a schedule row fits about ${MEETING_TITLE_MAX_LENGTH}.`,
    });
  }

  if (meeting.summary.length > MEETING_SUMMARY_MAX_LENGTH) {
    issues.push({
      id: meeting.id,
      code: "meeting_summary_too_long",
      message: `Summary is ${meeting.summary.length} characters; the card fits about ${MEETING_SUMMARY_MAX_LENGTH}.`,
    });
  }

  if (
    meeting.cancellationReason !== null &&
    meeting.cancellationReason.length > MEETING_CANCELLATION_REASON_MAX_LENGTH
  ) {
    issues.push({
      id: meeting.id,
      code: "meeting_cancellation_reason_too_long",
      message: `Cancellation reason is ${meeting.cancellationReason.length} characters; the notice fits about ${MEETING_CANCELLATION_REASON_MAX_LENGTH}.`,
    });
  }

  // The pairing rule: a reason with no cancellation date is a row nothing
  // renders and nobody can find to correct. The reverse -- cancelled with no
  // stated reason -- is allowed; the club does not always owe an explanation.
  // Mirrors `meetings_cancellationReason_needs_cancellation`.
  if (meeting.cancellationReason !== null && meeting.cancelledAt === null) {
    issues.push({
      id: meeting.id,
      code: "meeting_cancellation_reason_without_date",
      message:
        "cancellationReason is set but cancelledAt is null -- the reason is " +
        "only ever shown beside the date it explains. Set cancelledAt, or " +
        "clear the reason if the meeting is back on.",
    });
  }

  // Tested against the whole URL with `RSVP_URL_PATTERN`, not parsed with
  // `new URL()` and checked by hostname -- see that constant's comment for
  // why: a hostname-only check would happily wave through the wrong-scheme
  // and userinfo URLs the DB's check constraint exists to reject.
  if (meeting.rsvpUrl !== null && !RSVP_URL_PATTERN.test(meeting.rsvpUrl)) {
    issues.push({
      id: meeting.id,
      code: "meeting_rsvp_host",
      message:
        `rsvpUrl "${meeting.rsvpUrl}" is not on an allowed host. It has to ` +
        `be an https:// address on ${RSVP_URL_ALLOWED_HOSTS.join(" or ")}.`,
    });
  }
}

// ── Workshops ────────────────────────────────────────────────────────────────

function checkWorkshop(workshop: Workshop, issues: ValidationIssue[]): void {
  if (workshop.title.length > WORKSHOP_TITLE_MAX_LENGTH) {
    issues.push({
      id: workshop.id,
      code: "workshop_title_too_long",
      message: `Title is ${workshop.title.length} characters; a schedule row fits about ${WORKSHOP_TITLE_MAX_LENGTH}.`,
    });
  }

  if (
    workshop.description !== null &&
    workshop.description.length > WORKSHOP_DESCRIPTION_MAX_LENGTH
  ) {
    issues.push({
      id: workshop.id,
      code: "workshop_description_too_long",
      message: `Description is ${workshop.description.length} characters; the dialog fits about ${WORKSHOP_DESCRIPTION_MAX_LENGTH}.`,
    });
  }
}

// ── Questions ────────────────────────────────────────────────────────────────

/**
 * Question and option ids are unique (answers point at them); `prefill` is a
 * meeting question's (a member question already carries its one answer); and
 * a meeting lists only meeting questions that exist, each once. A retired
 * question may stay listed: it is simply not asked.
 */
function checkQuestions(
  config: QuestionsConfig,
  meetings: readonly Meeting[],
  issues: ValidationIssue[],
): void {
  const byId = new Map<string, QuestionsConfig["questions"][number]>();
  for (const question of config.questions) {
    if (byId.has(question.id)) {
      issues.push({
        id: question.id,
        code: "duplicate_question_id",
        message: `"${question.id}" names more than one question; answers are stored by id.`,
      });
    }
    byId.set(question.id, question);

    if (question.scope === "member" && question.prefill !== undefined) {
      issues.push({
        id: question.id,
        code: "member_question_prefill",
        message:
          `"${question.id}" is a member question, which always shows the ` +
          "person's saved answer; prefill is for meeting questions.",
      });
    }

    if ("options" in question) {
      const seen = new Set<string>();
      for (const option of question.options) {
        if (seen.has(option.id)) {
          issues.push({
            id: question.id,
            code: "duplicate_option_id",
            message: `"${question.id}" has more than one option "${option.id}".`,
          });
        }
        seen.add(option.id);
      }
    }
  }

  for (const meeting of meetings) {
    const listed = new Set<string>();
    for (const id of meeting.questions ?? []) {
      const question = byId.get(id);
      if (!question) {
        issues.push({
          id: meeting.id,
          code: "unknown_question",
          message: `Meeting "${meeting.id}" lists "${id}", which is not in questions.json.`,
        });
      } else if (question.scope === "member") {
        issues.push({
          id: meeting.id,
          code: "member_question_listed",
          message:
            `Meeting "${meeting.id}" lists "${id}", a member question. Member ` +
            "questions are asked at every check-in and are never listed.",
        });
      }
      if (listed.has(id)) {
        issues.push({
          id: meeting.id,
          code: "question_listed_twice",
          message: `Meeting "${meeting.id}" lists "${id}" more than once.`,
        });
      }
      listed.add(id);
    }
  }
}
