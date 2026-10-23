import { EVENT_TZ } from "~/lib/eventTime";

function clock(at: Date): { text: string; period: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minute = get("minute");
  return {
    text: minute === "00" ? get("hour") : `${get("hour")}:${minute}`,
    period: get("dayPeriod"),
  };
}

/**
 * "Mon, Oct 26 · 6–8 PM": a meeting's day and span the way the check-in page
 * and the projector print them. Meetings do not cross midnight. Pure, so it is
 * safe in a client component.
 */
export function formatMeetingWhen(startsAt: Date, endsAt: Date): string {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(startsAt);
  const from = clock(startsAt);
  const to = clock(endsAt);
  const span =
    from.period === to.period
      ? `${from.text}–${to.text} ${to.period}`
      : `${from.text} ${from.period} – ${to.text} ${to.period}`;
  return `${day} · ${span}`;
}
