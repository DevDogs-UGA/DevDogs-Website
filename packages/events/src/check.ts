#!/usr/bin/env node
import { type z } from "zod";
import meetingsFile from "./data/meetings.json" with { type: "json" };
import questionsFile from "./data/questions.json" with { type: "json" };
import { ClubConfigError } from "./index.js";
import { questionsConfigSchema } from "./questions.js";
import { clubConfigSchema } from "./schema.js";
import { validateClubConfig } from "./validator.js";

/**
 * `pnpm --filter @devdogsuga/events check:events` -- the CI gate.
 *
 * Config is validated exactly once, here, before it ever reaches a deploy:
 * the runtime reconcile (`server/config/reconcile.ts`) trusts what it parses
 * and refuses to partially apply a bad file rather than re-validating field
 * by field, so THIS is the only place an author gets a readable error. Wired
 * into `.github/workflows/ci.yaml` as a merge-blocking step.
 *
 * Each file's shape is reported under its own name; then the two are
 * validated together, since meetings list questions by id.
 */
function shapeErrors(file: string, error: z.ZodError): void {
  process.stderr.write(`events: src/data/${file} does not match the schema:\n`);
  for (const issue of error.issues) {
    process.stderr.write(`  ${issue.path.join(".")}: ${issue.message}\n`);
  }
}

function main(): number {
  const meetings = clubConfigSchema.safeParse(meetingsFile);
  const questions = questionsConfigSchema.safeParse(questionsFile);
  if (!meetings.success) shapeErrors("meetings.json", meetings.error);
  if (!questions.success) shapeErrors("questions.json", questions.error);
  if (!meetings.success || !questions.success) return 1;

  const issues = validateClubConfig(meetings.data, questions.data);
  if (issues.length > 0) {
    process.stderr.write(`${new ClubConfigError(issues).message}\n`);
    return 1;
  }

  const workshopCount = meetings.data.meetings.reduce(
    (total, meeting) => total + meeting.agenda.length,
    0,
  );
  process.stdout.write(
    `events: ok (${meetings.data.meetings.length} meetings, ${workshopCount} workshops, ` +
      `${questions.data.questions.length} questions)\n`,
  );
  return 0;
}

process.exit(main());
