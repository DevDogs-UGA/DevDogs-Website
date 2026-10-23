import { getSeries } from "@devdogsuga/events";

/**
 * The small line over a topic-headline night's title: its series' name
 * ("Workshop Wednesday" over the workshop's topic). Null for any night whose
 * series leads with its own name, and for a one-off.
 *
 * Server-side only, on purpose: it reads `series.json`, which a client
 * component must not pull into its bundle. Callers hand the string down.
 */
export function seriesKicker(series: string | null): string | null {
  if (series === null) return null;
  const found = getSeries().series.find((s) => s.id === series);
  return found?.headline === "topic" ? found.name : null;
}
