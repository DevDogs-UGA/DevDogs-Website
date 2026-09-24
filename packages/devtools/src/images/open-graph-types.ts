/**
 * Type-only surface for `@devdogsuga/open-graph` — a hand-maintained mirror
 * of what `images/*.ts` actually uses, not a full re-export.
 *
 * `@devdogsuga/open-graph` is `"private": true` and never published — it
 * stays in DevDogsUGA (see the ledger) and devtools resolves it FROM the
 * repo at runtime (`repo/source.ts`'s `loadOpenGraph()`), never as a
 * Backstage dependency. Backstage has no copy of the package to pull real
 * types from, so these are duplicated for editor/typecheck convenience only
 * and MUST be kept in sync by hand if the real shape changes. Runtime
 * values always come from `loadOpenGraph()`, never from here.
 *
 * `EventDetail` and the `THEME` shape are NOT duplicated here: both are
 * re-exported by open-graph from `@devdogsuga/brand`, which — unlike
 * open-graph — IS a real Backstage package (published; see the ledger), so
 * those two types are imported for real below.
 */
import type { ReactElement } from "react";
import type { EventDetail } from "@devdogsuga/brand/event";
import type { LoadedFont } from "@devdogsuga/brand";

export type { EventDetail, LoadedFont };

export type FormatFamily = "card" | "email" | "icon";

export interface Format {
  name: string;
  width: number;
  height: number;
  scale: number;
  family: FormatFamily;
  why: string;
}

/**
 * `@devdogsuga/open-graph`'s `AppKey` is a string-literal union
 * (`"platform" | "dogdays" | "dogpack"` as of this writing). Widened to
 * `string` here rather than duplicating the literal list, which would
 * silently drift the moment a fourth app gets an icon — `APPS`'s real keys
 * are what devtools actually iterates over at runtime.
 */
export type AppKey = string;

export interface AppBrand {
  name: string;
  tagline: string;
  blurb: string;
  host: string;
  ground: string;
  mark: string;
}

export interface PageCardCopy {
  title: string;
  description: string;
  eyebrow?: string;
  accent?: string;
  footer?: string;
}

/**
 * The five JSX template components. Typed loosely (`(...args) =>
 * ReactElement`, props as `any`) rather than duplicating each one's exact
 * props interface — those are the deepest, most likely to drift part of
 * open-graph's surface, and devtools only ever calls them with object
 * literals built right next to the call site, where a real typo would show
 * up as a runtime prop-shape mismatch the same way it would with `any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TemplateComponent = (props: any) => ReactElement;

export interface OpenGraphModule {
  FORMATS: Record<string, Format>;
  OPAQUE_FORMATS: ReadonlySet<string>;
  loadFonts: () => LoadedFont[];
  APPS: Record<AppKey, AppBrand>;
  AppIcon: TemplateComponent;
  Banner: TemplateComponent;
  EmailSignature: TemplateComponent;
  EventCard: TemplateComponent;
  PageCard: TemplateComponent;
  PAGE_CARDS: Record<string, PageCardCopy>;
  THEME: Record<string, string>;
}
