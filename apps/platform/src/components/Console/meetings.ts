import { EVENT_TZ } from "~/lib/eventTime";

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "short",
});
const DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  day: "numeric",
});
const MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  month: "short",
});

/** The `DateTile` props for a start time, in the club's zone. */
export function tileOf(at: Date) {
  return {
    weekday: WEEKDAY.format(at),
    day: DAY.format(at),
    month: MONTH.format(at),
  };
}
