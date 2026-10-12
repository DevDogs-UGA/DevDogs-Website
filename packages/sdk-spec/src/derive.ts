/**
 * The spec files that are not authored but exported from the TypeScript
 * sources: the moderation JSON Schema (from the zod schemas), the brand tokens
 * (from the brand module) and the telemetry scrub rules.
 *
 * TypeScript stays the source for these because that is where they are used
 * and tested; the Dart SDK reads the exported copy, and the drift check fails
 * when an edit here is not regenerated.
 */
import { moderationJsonSchemas } from "../../sdk/src/moderation/messages.js";
import { APPS } from "../../sdk/src/brand/apps.js";
import {
  ACCENT,
  BLOCK_SHADOW,
  CONTACT,
  MAUVE,
  THEME,
  WORDMARK_METRICS,
} from "../../sdk/src/brand/brand.js";
import { EMBEDDED_FONTS } from "../../sdk/src/brand/generated/fonts.js";
import { markSvg } from "../../sdk/src/brand/marks-data.js";
import { PALETTE } from "../../sdk/src/brand/palette.js";
import { SCRUB_RULES } from "../../sdk/src/telemetry/scrub.js";

type Json = Record<string, unknown>;

function withoutSchemaKey(schema: unknown): Json {
  const { $schema: _ignored, ...rest } = schema as Json;
  return rest;
}

/** The artwork the Dart SDK ships (SVG only: the banners are large PNG twins). */
export const DART_ARTWORK = [
  "devdog.svg",
  "devdogs-logo.svg",
  "devdogs-logo-dark.svg",
  "dogdays.svg",
  "dogpack.svg",
] as const;

export function fontFileName(font: { name: string; weight: number }): string {
  return `${font.name.replace(/ /g, "")}-${font.weight}.ttf`;
}

/** `moderation/schema.json`: the report and message shapes, as `$defs`. */
export function moderationSchema(): Json {
  const schemas = moderationJsonSchemas();
  const message = withoutSchemaKey(schemas.ModerationMessage);
  const members = message["anyOf"];
  if (!Array.isArray(members) || members.length !== 2) {
    throw new Error(
      "ModerationMessage should be a union of a content and a user message; update derive.ts",
    );
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $comment:
      "Generated from @devdogsuga/sdk/moderation (the zod schemas). Do not edit by hand.",
    $defs: {
      ReportRequest: withoutSchemaKey(schemas.ReportRequest),
      ReportResponse: withoutSchemaKey(schemas.ReportResponse),
      ReportError: withoutSchemaKey(schemas.ReportError),
      ContentMessage: members[0] as Json,
      UserMessage: members[1] as Json,
      ModerationMessage: {
        anyOf: [
          { $ref: "#/$defs/ContentMessage" },
          { $ref: "#/$defs/UserMessage" },
        ],
      },
    },
  };
}

/** `brand/tokens.json`: the palette, theme, app identities and mark geometry. */
export function brandTokens(): Json {
  return {
    $comment: "Generated from @devdogsuga/sdk/brand. Do not edit by hand.",
    palette: PALETTE,
    mauve: MAUVE,
    accent: ACCENT,
    theme: THEME,
    blockShadow: BLOCK_SHADOW,
    contact: CONTACT,
    wordmarkMetrics: WORDMARK_METRICS,
    apps: APPS,
    marks: {
      dogdays: markSvg("dogdays"),
      dogpack: markSvg("dogpack"),
    },
    fonts: EMBEDDED_FONTS.map((font) => ({
      family: font.name,
      weight: font.weight,
      style: font.style,
      file: fontFileName(font),
    })),
    artwork: DART_ARTWORK,
  };
}

/** `telemetry/scrub.json`: the text scrubbers, as regular expressions. */
export function scrubRules(): Json {
  return {
    $comment:
      "Generated from @devdogsuga/sdk/telemetry (SCRUB_RULES). Do not edit by hand.",
    rules: SCRUB_RULES,
  };
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
