import { EVENT_TZ } from "@devdogsuga/brand/event";

/** Explicit minutes, an en dash, and a shared meridiem when possible. */
export function timeRange(startsAt: Date, endsAt: Date): string {
  const clock = (at: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: EVENT_TZ,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(at);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)!.value;
    return [`${value("hour")}:${value("minute")}`, value("dayPeriod")];
  };
  const [start, startMeridiem] = clock(startsAt);
  const [end, endMeridiem] = clock(endsAt);
  return startMeridiem === endMeridiem
    ? `${start}–${end} ${endMeridiem}`
    : `${start} ${startMeridiem}–${end} ${endMeridiem}`;
}
