/**
 * The three exports, moved from the platform's `server/export/` with their
 * columns unchanged: anything downstream that read `/export/stars` reads
 * `backstage export stars` the same way.
 *
 * Each query selects exactly its columns, aliased to the header names, in
 * header order. Parameters: `$1` from (inclusive), `$2` to (exclusive), `$3`
 * a meeting id; each null when not given.
 */

export const EXPORT_KINDS = ["stars", "attendance", "reflections"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportFilters {
  from?: Date;
  to?: Date;
  /** Attendance only. */
  meetingId?: string;
}

export interface ExportSpec {
  columns: readonly string[];
  sql: string;
  summary: string;
}

/** The member columns every export leads with. */
const MEMBER = (userId: string) => `
  ${userId} as "user_id",
  p."preferredName" as "preferred_name",
  u."email" as "email",
  (
    select i."identity_data" ->> 'user_name'
    from "auth"."identities" i
    where i."user_id" = ${userId} and i."provider" = 'github'
    limit 1
  ) as "github_login"`;

const MEMBER_COLUMNS = ["user_id", "preferred_name", "email", "github_login"];

const MEMBER_JOINS = (userId: string) => `
left join "platform"."profile" p on p."userId" = ${userId}
left join "auth"."users" u on u."id" = ${userId}`;

export const EXPORTS: Record<ExportKind, ExportSpec> = {
  /**
   * One row per earned star: a meeting attended or a competition entered.
   * Attendance is a meeting fact and participation a competition fact;
   * neither is attributed to a workshop.
   */
  stars: {
    summary: "One row per earned meeting or competition star.",
    columns: [
      ...MEMBER_COLUMNS,
      "activity_type",
      "activity_id",
      "activity_starts_at",
      "earned_at",
      "meeting_id",
      "competition_id",
      "meeting_star",
      "competition_star",
      "won",
    ],
    sql: `
select ${MEMBER('ms."userId"')},
  ms."activityType" as "activity_type",
  ms."activityId" as "activity_id",
  ms."startsAt" as "activity_starts_at",
  ms."earnedAt" as "earned_at",
  ms."meetingId" as "meeting_id",
  ms."competitionId" as "competition_id",
  ms."activityType" = 'meeting' as "meeting_star",
  ms."activityType" = 'competition' as "competition_star",
  ms."won" as "won"
from "platform"."memberStars" ms
${MEMBER_JOINS('ms."userId"')}
where ($1::timestamptz is null or ms."startsAt" >= $1::timestamptz)
  and ($2::timestamptz is null or ms."startsAt" < $2::timestamptz)
  and $3::uuid is null
order by ms."startsAt", ms."userId", ms."activityType", ms."activityId"`,
  },

  /**
   * One row per check-in, the raw ledger under the stars: an officer
   * reconciling a night sees every scan (and every imported row, method
   * `import`) rather than a derived boolean.
   */
  attendance: {
    summary: "One row per check-in: who, which meeting, when, and how.",
    columns: [
      ...MEMBER_COLUMNS,
      "meeting_config_id",
      "meeting_title",
      "meeting_starts_at",
      "checked_in_at",
      "check_in_method",
      "counts_for_credit",
    ],
    sql: `
select ${MEMBER('a."userId"')},
  m."configId" as "meeting_config_id",
  coalesce(m."nameOverride", m."kind", 'Meeting') as "meeting_title",
  m."startsAt" as "meeting_starts_at",
  a."recordedAt" as "checked_in_at",
  a."method"::text as "check_in_method",
  m."countsForCredit" as "counts_for_credit"
from "platform"."attendance" a
join "platform"."meetings" m on m."id" = a."meetingId"
${MEMBER_JOINS('a."userId"')}
where ($1::timestamptz is null or m."startsAt" >= $1::timestamptz)
  and ($2::timestamptz is null or m."startsAt" < $2::timestamptz)
  and ($3::uuid is null or a."meetingId" = $3::uuid)
order by m."startsAt", a."userId", a."id"`,
  },

  /**
   * One row per reflection, carrying the member's current text. The revision
   * history stays in `reflectionRevisions`; this is "what did people write",
   * not "who edited what".
   */
  reflections: {
    summary: "One row per reflection, with the member's current text.",
    columns: [
      ...MEMBER_COLUMNS,
      "activity_type",
      "activity_id",
      "activity_title",
      "content",
      "submitted_at",
      "created_at",
      "updated_at",
      "revision_count",
    ],
    sql: `
select ${MEMBER('r."userId"')},
  case when r."meetingId" is not null then 'meeting' else 'competition' end as "activity_type",
  coalesce(r."meetingId", r."competitionId") as "activity_id",
  case
    when r."meetingId" is not null then (
      select coalesce(m."nameOverride", m."kind", 'Meeting')
      from "platform"."meetings" m where m."id" = r."meetingId"
    )
    else (select c."title" from "platform"."competitions" c where c."id" = r."competitionId")
  end as "activity_title",
  r."content" as "content",
  r."submittedAt" as "submitted_at",
  r."createdAt" as "created_at",
  r."updatedAt" as "updated_at",
  (
    select count(*)::int from "platform"."reflectionRevisions" rr
    where rr."reflectionId" = r."id"
  ) as "revision_count"
from "platform"."reflections" r
${MEMBER_JOINS('r."userId"')}
where ($1::timestamptz is null or r."createdAt" >= $1::timestamptz)
  and ($2::timestamptz is null or r."createdAt" < $2::timestamptz)
  and $3::uuid is null
order by r."createdAt", r."userId", r."id"`,
  },
};

export function exportParams(filters: ExportFilters): (string | null)[] {
  return [
    filters.from?.toISOString() ?? null,
    filters.to?.toISOString() ?? null,
    filters.meetingId ?? null,
  ];
}

/**
 * The filters as the audit row records them, in the platform's shape: an
 * unfiltered export is an explicit `{}`, distinguishable from a slice.
 */
export function auditFilters(filters: ExportFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.from) out.from = filters.from.toISOString();
  if (filters.to) out.to = filters.to.toISOString();
  if (filters.meetingId) out.meetingId = filters.meetingId;
  return out;
}
