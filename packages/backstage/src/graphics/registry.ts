import {
  APPS,
  AppIcon,
  Banner,
  EmailSignature,
  EventCard,
  FORMATS,
  OPAQUE_FORMATS,
  PageCard,
  THEME,
  type EventDetail,
  type Format,
} from "@devdogsuga/brand";
import { UsageError } from "@devdogsuga/cli-core/ui";
import type { ReactElement } from "react";

/**
 * What the club draws pictures OF, as opposed to what size it draws them at.
 *
 * Those are two axes and this file owns one of them; `@devdogsuga/brand`'s
 * `formats.ts` owns the other. Keeping them apart is the point: an event poster
 * for the GDG on Campus platform is the pairing "this meeting" x "that
 * platform's banner", and while they were one flat list of hard-coded
 * (content, size) targets, no such pairing could be asked for.
 *
 * The matrix is SPARSE, and each graphic declares its own column of it. Every
 * graphic supports the two GDG renditions, because anything the club makes may
 * end up on that platform. Beyond that: `savvycal` is one cover on one
 * scheduling page and belongs to the club lockup alone, the email densities
 * belong to the lockup too, and the icon sizes belong to the apps.
 *
 * There is no `page/*` group: the page cards render per request inside the
 * platform, which owns their copy. And nothing here knows a repository path;
 * every file is written where the caller asked, named by {@link Graphic.stem}.
 */

export interface Graphic {
  /** `group/name`, which is what the CLI matches and globs against. */
  name: string;
  group: "brand" | "app" | "event";
  /** The leaf. Unique across every graphic: `assertUniqueStems` enforces it. */
  stem: string;
  /** Format names this can be rendered at. */
  formats: string[];
  /** One line: what this picture is. */
  why: string;
  render: (format: Format) => ReactElement;
}

/** The two renditions anything may need, because anything may reach the GDG platform. */
const GDG = ["gdgc-wide", "gdgc-square"];
const EVENT_FORMATS = ["og", ...GDG, "involvement-network"];
const EMAIL = ["email-1x", "email-2x", "email-3x"];
const ICON_SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512, 1024];

/* ------------------------------------------------------------------- brand */

/**
 * The club lockup, on each of the two grounds it is ever set on.
 *
 * One subject, two grounds, and the rendition decides which template draws it:
 * the email densities want the signature's tight horizontal strip, everything
 * else wants the banner. That is why "the email signature" is not a graphic of
 * its own: it is this lockup at `email-2x`, and its GDG export is the same
 * lockup at `gdgc-square` rather than a second drawing that has to be kept in
 * step with the first.
 */
function brandGraphics(): Graphic[] {
  return (["dark", "light"] as const).map((ground) => ({
    name: ground === "dark" ? "brand/club" : "brand/club-light",
    group: "brand",
    stem: ground === "dark" ? "club" : "club-light",
    formats: [
      "og",
      ...GDG,
      ...(ground === "dark" ? ["savvycal"] : []),
      ...EMAIL,
    ],
    why: `The DevDogs lockup with the GDG chapter cobrand, on a ${ground} ground.`,
    render: (format) =>
      format.family === "email"
        ? EmailSignature({ width: format.width, ground })
        : Banner({ width: format.width, height: format.height, ground }),
  }));
}

/* --------------------------------------------------------------------- apps */

function appGraphics(): Graphic[] {
  return (Object.keys(APPS) as (keyof typeof APPS)[]).map((app) => {
    const brand = APPS[app];

    return {
      name: `app/${app}`,
      group: "app",
      stem: app,
      formats: [
        ...ICON_SIZES.map((size) => `icon-${size}`),
        // Next's file-convention icons, for an app that ships them.
        "icon-favicon",
        "icon-apple",
        "og",
        ...GDG,
      ],
      why: `${brand.name}: its mark as an icon, and its card as a link.`,
      render: (format) =>
        format.family === "icon"
          ? AppIcon({
              app,
              size: format.width,
              background: OPAQUE_FORMATS.has(format.name)
                ? THEME.background
                : undefined,
            })
          : PageCard({
              width: format.width,
              height: format.height,
              title: brand.name,
              description: brand.blurb,
              eyebrow: brand.tagline,
              accent: brand.ground,
              footer: brand.host,
              cobrand: true,
            }),
    };
  });
}

/* ------------------------------------------------------------------- events */

/** A meeting, already loaded and formatted, ready to be drawn. */
export interface EventGraphicSource {
  slug: string;
  detail: EventDetail;
  /** For the picker's hint: when it is, and whether it is on. */
  hint: string;
  /** Separate cards generated only when the night contains multiple items. */
  items?: Array<{ detail: EventDetail; stem: string }>;
}

/**
 * One graphic per meeting, and one per agenda item when a night has several.
 *
 * These are the reason the two axes were split at all: "this meeting" x "the
 * GDG platform's banner" is a pairing nobody could have enumerated in advance.
 */
export function eventGraphics(events: EventGraphicSource[]): Graphic[] {
  return events.flatMap((event) => {
    const meeting: Graphic = {
      name: `event/${event.slug}/meeting`,
      group: "event",
      stem: event.slug,
      formats: EVENT_FORMATS,
      why: `The ${event.slug} meeting: ${event.hint}.`,
      render: (format) =>
        EventCard({
          width: format.width,
          height: format.height,
          cobrand: true,
          ...event.detail,
        }),
    };

    if ((event.items?.length ?? 0) < 2) return [meeting];

    const occurrences = new Map<string, number>();
    const items = event.items!.map((item): Graphic => {
      const occurrence = (occurrences.get(item.stem) ?? 0) + 1;
      occurrences.set(item.stem, occurrence);
      const path = occurrence === 1 ? item.stem : `${item.stem}-${occurrence}`;

      return {
        name: `event/${event.slug}/${path}`,
        group: "event",
        // Output is flat, so the stem still carries the meeting.
        stem: `${event.slug}-${path}`,
        formats: EVENT_FORMATS,
        why: `${item.detail.badge?.label ?? "Agenda item"}: ${item.detail.title} (${event.hint}).`,
        render: (format) =>
          EventCard({
            width: format.width,
            height: format.height,
            cobrand: true,
            ...item.detail,
          }),
      };
    });

    return [meeting, ...items];
  });
}

/* --------------------------------------------------------------------- all */

/** Everything that does not depend on the schedule. */
export function staticGraphics(): Graphic[] {
  return [...brandGraphics(), ...appGraphics()];
}

/**
 * Every leaf is unique, so a flat output directory cannot silently overwrite
 * one graphic's file with another's.
 */
export function assertUniqueStems(graphics: Graphic[]): void {
  const seen = new Map<string, string>();

  for (const graphic of graphics) {
    const clash = seen.get(graphic.stem);
    if (clash) {
      throw new UsageError(
        `${graphic.name} and ${clash} share the leaf "${graphic.stem}", so a flat output directory would overwrite one with the other.`,
      );
    }
    seen.set(graphic.stem, graphic.name);
  }
}

export { FORMATS };
