import type { ScrapeTx } from "~/db/client";

/** One registrar CSV row, keyed by its header. */
export type Row = Record<string, string>;

export type DrizzleTransaction = ScrapeTx;
