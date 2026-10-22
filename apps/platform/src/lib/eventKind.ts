/**
 * The six event categories the redesign colours by (`data-kind` in cosmic.css,
 * `KIND` in the SDK palette). DevDogs red is the brand pair beside them, never
 * a category.
 */
export const EVENT_CATEGORIES = [
  "build",
  "workshop",
  "social",
  "info",
  "study",
  "milestone",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/**
 * What `categoryOf` reads from a meeting. Structural, so a loader row, a
 * calendar entry or a bare literal all fit, and `segments` (from
 * `resolveMeetingSegments`) and `workshops` are both accepted since callers
 * hold one or the other.
 */
export interface CategorisableMeeting {
  kind: string | null;
  segments?: readonly string[];
  workshops?: readonly unknown[];
}

const BY_KIND: Readonly<Record<string, EventCategory>> = {
  "Build Session": "build",
  "Study Session": "study",
  "Interest Meeting": "info",
  Social: "social",
  "Demo Night": "milestone",
};

/**
 * D12: maps a meeting to its category. Any night with a workshop wins, then the
 * authored `kind`, and everything else (a one-off with no kind and no
 * workshop) is a build night.
 *
 * Replace the body with the config's `category` field when the meeting-series
 * redesign lands; callers do not change.
 */
export function categoryOf(meeting: CategorisableMeeting): EventCategory {
  if (
    meeting.segments?.includes("workshop") ||
    (meeting.workshops?.length ?? 0) > 0
  ) {
    return "workshop";
  }
  const kind = meeting.kind;
  return kind !== null && Object.hasOwn(BY_KIND, kind)
    ? BY_KIND[kind]!
    : "build";
}
