import { sql } from "drizzle-orm";

/** A list of numbers as one JSON text parameter, for `= ANY(...)` without one bind parameter each. */
export function crnList(crns: Iterable<number>) {
  return sql`(select jsonb_array_elements_text(${JSON.stringify([...crns])}::jsonb)::int)`;
}
