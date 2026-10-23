import "./passport.css";

import { StarIcon } from "@phosphor-icons/react/ssr";
import type { StarTotals } from "~/server/loaders/stars";

/** Lifetime participation volume: the star count, shown on a profile and above the passport. */
export function StarTotalsRow({ totals }: { totals: StarTotals }) {
  return (
    <dl className="m-0 flex gap-6">
      <div>
        <dt className="text-[11.5px] font-bold tracking-[0.1em] text-[var(--text-3)] uppercase">
          Meetings
        </dt>
        <dd className="m-0 mt-2 flex items-baseline gap-1.5 font-[family-name:var(--font-display)] text-[26px] leading-none font-extrabold text-[var(--text)] tabular-nums">
          <span aria-hidden className="att-star">
            ★
          </span>
          {totals.meetingStars}
        </dd>
      </div>
    </dl>
  );
}

export interface PassportStreak {
  current: number;
  longest: number;
  thisWeekEarned: number;
  thisWeekRequired: number;
}

/** The four numbers above the passport (`attendance.html` `.sum`). */
export function PassportSummary({
  totals,
  streak,
}: {
  totals: StarTotals;
  streak: PassportStreak | null;
}) {
  return (
    <dl className="att-sum" aria-label="Your totals">
      <div>
        <dt>Stars</dt>
        <dd>
          <StarIcon
            weight="fill"
            aria-hidden
            className="att-star mr-1 inline-block align-[-3px]"
          />
          {totals.meetingStars}
        </dd>
      </div>
      {streak && (
        <>
          <div>
            <dt>Current streak</dt>
            <dd>
              {streak.current} <small>{unit(streak.current, "week")}</small>
            </dd>
          </div>
          <div>
            <dt>Longest streak</dt>
            <dd>
              {streak.longest} <small>{unit(streak.longest, "week")}</small>
            </dd>
          </div>
          <div>
            <dt>This week</dt>
            <dd>
              {streak.thisWeekRequired === 0 ? (
                <small>No eligible events</small>
              ) : (
                <>
                  {streak.thisWeekEarned}/{streak.thisWeekRequired}{" "}
                  <small>{unit(streak.thisWeekRequired, "star")}</small>
                </>
              )}
            </dd>
          </div>
        </>
      )}
    </dl>
  );
}

function unit(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
