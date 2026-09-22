/**
 * The officer-change command grammar: the contract between an Airtable form
 * response and whatever applies it.
 *
 * This is the *treaty* half of the officer-change feature, which is why it
 * lives here beside the registry rather than in the engine that consumes it.
 * The registry already owns the field ids this module reads; keeping the
 * grammar anywhere else means two repos have to agree on a field id AND on
 * what the values mean, and only one of them is checked against the base.
 *
 * What deliberately does NOT live here: identity. The engine decides what a
 * member identifier is — in DevDogsUGA that is a UGA MyID normalized to a
 * `@uga.edu` address, which is institutional policy, not base shape. So the
 * two places that resolve an identifier take a caller-supplied resolver
 * (`createOfficerChangeGrammar`), and everything that needs no resolver
 * (the schema, the digests, the error type) is a plain export.
 *
 * Also not here: applying a command. Receipts, leases, refusals, Postgres
 * effects and the account-creation side of identity are platform policy and
 * stay in the engine. This module only turns a record into a validated,
 * normalized command — or throws `InvalidOfficerChangeError`.
 *
 * Exported from the `./officer-change` subpath, not the package root: the root
 * is the zod-free base treaty (client, DSL, registry, push/pull/verify), and a
 * scaffolding script has no reason to pull a validator into its module graph.
 */

import { z } from "zod";
import { officerChangesTable } from "./registry.js";
import type { AirtableRecord } from "./client.js";
import type { AirtableValue } from "./field.js";

const uuid = z.string().uuid();
const reason = z.string().trim().min(1).max(500);

const attendanceCommand = z.discriminatedUnion("action", [
  z.object({
    kind: z.literal("attendance"),
    action: z.literal("add"),
    meetingId: uuid,
    member: z.string(),
    reason,
  }),
  z.object({
    kind: z.literal("attendance"),
    action: z.enum(["revoke", "restore"]),
    attendanceId: uuid,
    reason,
  }),
]);

const participationCommand = z.object({
  kind: z.literal("competition_participation"),
  action: z.enum(["grant", "revoke", "clear"]),
  teamId: uuid,
  reason,
});

const reflectionCommand = z
  .object({
    kind: z.literal("reflection"),
    action: z.literal("edit"),
    reflectionId: uuid,
    reason,
    content: z.string().max(12_000).optional(),
    submitted: z.boolean().optional(),
    member: z.string().optional(),
    meetingId: uuid.optional(),
    competitionId: uuid.optional(),
  })
  .superRefine((value, context) => {
    const changes = [
      value.content !== undefined,
      value.submitted !== undefined,
      value.member !== undefined,
      value.meetingId !== undefined,
      value.competitionId !== undefined,
    ].filter(Boolean).length;
    if (changes === 0) {
      context.addIssue({
        code: "custom",
        message: "A reflection edit must change at least one field.",
      });
    }
    if (value.meetingId !== undefined && value.competitionId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "A reflection can be assigned to only one activity.",
      });
    }
  });

/**
 * The pure command contract. Safe to reuse for form validation anywhere; it
 * validates shape only and performs no identity resolution.
 */
export const officerChangeCommandSchema = z.union([
  attendanceCommand,
  participationCommand,
  reflectionCommand,
]);

export type OfficerChangeCommand = z.infer<typeof officerChangeCommandSchema>;

export interface OfficerChangeActor {
  airtableUserId: string;
  displayName: string | null;
  email: string;
}

export class InvalidOfficerChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOfficerChangeError";
  }
}

/**
 * Turns a raw identifier into the single canonical identity string the rest of
 * the pipeline stores, or `null` when it is not an identity this consumer
 * accepts. Returning `null` (rather than throwing) keeps the refusal message
 * in the grammar, where it is worded for the officer who filled the form.
 */
export type MemberIdentityResolver = (raw: string | null) => string | null;

export interface OfficerChangeGrammarOptions {
  /** Applied to the member identifier an officer typed into the form. */
  resolveMemberIdentity: MemberIdentityResolver;
  /**
   * Applied to the email on Airtable's immutable `Created by` collaborator.
   * Defaults to `resolveMemberIdentity` — a consumer whose submitters and
   * subjects come from the same directory (DevDogsUGA's does) wants exactly
   * that, and separating them lets one that does not say so.
   */
  resolveActorEmail?: MemberIdentityResolver;
}

export interface OfficerChangeGrammar {
  normalizeOfficerChange(input: unknown): OfficerChangeCommand;
  parseOfficerChangeRecord(record: AirtableRecord): OfficerChangeCommand;
  parseOfficerChangeActor(record: AirtableRecord): OfficerChangeActor;
  /** Re-exposed so one binding covers every call site in a consumer. */
  officerChangeDigest(command: OfficerChangeCommand): Promise<string>;
  rawOfficerChangeDigest(record: AirtableRecord): Promise<string>;
}

function text(value: AirtableValue): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

/**
 * Binds the grammar to one consumer's identity rules. Bind it once at module
 * scope — a resolver that differs between two calls would let the same form
 * response normalize two ways, and the receipt digest is what notices.
 */
export function createOfficerChangeGrammar(
  options: OfficerChangeGrammarOptions,
): OfficerChangeGrammar {
  const { resolveMemberIdentity } = options;
  const resolveActorEmail = options.resolveActorEmail ?? resolveMemberIdentity;

  /**
   * Converts a form-shaped value into the only command representation receipts
   * and mutations accept. Member identities are normalized through the
   * caller's resolver here so retries cannot disagree over casing or whether
   * an officer typed the domain.
   */
  function normalizeOfficerChange(input: unknown): OfficerChangeCommand {
    const parsed = officerChangeCommandSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidOfficerChangeError(
        parsed.error.issues.map((issue) => issue.message).join(" "),
      );
    }

    const command = parsed.data;
    if ("member" in command && command.member !== undefined) {
      const email = resolveMemberIdentity(command.member);
      if (email === null) {
        throw new InvalidOfficerChangeError(
          "Member must be a valid UGA MyID or uga.edu address.",
        );
      }
      return { ...command, member: email };
    }
    return command;
  }

  function parseOfficerChangeActor(record: AirtableRecord): OfficerChangeActor {
    const value = record.fields[officerChangesTable.fields.createdBy.id];
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      typeof value.id !== "string" ||
      typeof value.email !== "string"
    ) {
      throw new InvalidOfficerChangeError(
        "The response has no attributable Airtable submitter.",
      );
    }
    const email = resolveActorEmail(value.email);
    if (email === null) {
      throw new InvalidOfficerChangeError(
        "The Airtable submitter must use a UGA email address.",
      );
    }
    return {
      airtableUserId: value.id,
      displayName:
        typeof value.name === "string" && value.name.trim() !== ""
          ? value.name.trim()
          : null,
      email,
    };
  }

  /** Maps one immutable Airtable form response into the normalized boundary. */
  function parseOfficerChangeRecord(
    record: AirtableRecord,
  ): OfficerChangeCommand {
    const fields = record.fields;
    const spec = officerChangesTable.fields;
    const command = text(fields[spec.command.id]);
    const targetId = text(fields[spec.targetId.id]);
    const reasonValue = text(fields[spec.reason.id]);
    const member = text(fields[spec.member.id]);
    const meetingId = text(fields[spec.meetingId.id]);

    const common = { reason: reasonValue };
    // Runtime Airtable values are strings even though the registry narrows the
    // configured choices, so unknown/renamed choices must reach the refusal.
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (command) {
      case "Add attendance":
        return normalizeOfficerChange({
          kind: "attendance",
          action: "add",
          meetingId,
          member,
          ...common,
        });
      case "Revoke attendance":
      case "Restore attendance":
        return normalizeOfficerChange({
          kind: "attendance",
          action: command === "Revoke attendance" ? "revoke" : "restore",
          attendanceId: targetId,
          ...common,
        });
      case "Grant competition participation":
      case "Revoke competition participation":
      case "Clear competition participation override":
        return normalizeOfficerChange({
          kind: "competition_participation",
          action:
            command === "Grant competition participation"
              ? "grant"
              : command === "Revoke competition participation"
                ? "revoke"
                : "clear",
          teamId: targetId,
          ...common,
        });
      case "Edit reflection": {
        const state = text(fields[spec.reflectionState.id]);
        const replacementContent = text(fields[spec.reflectionContent.id]);
        const clearContent = fields[spec.clearReflectionContent.id] === true;
        if (clearContent && replacementContent !== undefined) {
          throw new InvalidOfficerChangeError(
            "Choose replacement reflection content or clear it, not both.",
          );
        }
        return normalizeOfficerChange({
          kind: "reflection",
          action: "edit",
          reflectionId: targetId,
          content: clearContent ? "" : replacementContent,
          submitted:
            state === "Submitted"
              ? true
              : state === "Draft"
                ? false
                : undefined,
          member: text(fields[spec.newMember.id]),
          meetingId: text(fields[spec.newMeetingId.id]),
          competitionId: text(fields[spec.newCompetitionId.id]),
          ...common,
        });
      }
      default:
        throw new InvalidOfficerChangeError("Command is required.");
    }
  }

  return {
    normalizeOfficerChange,
    parseOfficerChangeRecord,
    parseOfficerChangeActor,
    officerChangeDigest,
    rawOfficerChangeDigest,
  };
}

/** Stable SHA-256 used to pin a receipt to its first normalized payload. */
export async function officerChangeDigest(
  command: OfficerChangeCommand,
): Promise<string> {
  return sha256(JSON.stringify(command));
}

/** Pins an invalid response too, without storing its potentially sensitive text. */
export async function rawOfficerChangeDigest(
  record: AirtableRecord,
): Promise<string> {
  const fields = officerChangesTable.fields;
  const values = [
    fields.command,
    fields.targetId,
    fields.member,
    fields.meetingId,
    fields.reason,
    fields.createdBy,
    fields.reflectionContent,
    fields.clearReflectionContent,
    fields.reflectionState,
    fields.newMember,
    fields.newMeetingId,
    fields.newCompetitionId,
  ].map((fieldSpec) => canonicalValue(record.fields[fieldSpec.id]));
  return sha256(JSON.stringify(values));
}

function canonicalValue(value: AirtableValue): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested as AirtableValue)]),
    );
  }
  return value ?? null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
