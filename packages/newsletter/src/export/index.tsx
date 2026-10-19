import { CAMPAIGN_SVGS } from "../campaign-assets.js";
/**
 * The Node-side export surface: render an issue to a complete HTML document,
 * describe the images that need rasterising, and assemble the .eml.
 *
 * Deliberately a separate entry point (`@devdogsuga/newsletter/export`): this
 * file imports `react-dom/server` and uses `Buffer`, and neither belongs in
 * anything a browser or a Worker bundles. The devtools CLI is the intended
 * caller — it owns resvg, so rasterising the `EmailImage` manifest to PNG
 * happens there and the results come back through `buildEml`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import {
  DATA_URI_ASSETS,
  DEVDOGS_LOCKUP,
  hostedThemeImage,
  GDGC_UGA,
  MARK_SIZES,
  partnerLogoSize,
  type RenderContext,
} from "../assets.js";
import { ChangelogDocument } from "../components.js";
import {
  SOCIAL_ICON_NAMES,
  socialIconSvg,
  type SocialIconName,
} from "../icons.js";
import type { ChangelogIssue } from "../issues.js";
import { PARTNER_NAMES, partnerSvg, type PartnerName } from "../partners.js";
import { THEME_IMAGE_BASE } from "../design.js";
import { THEME_PNGS } from "../generated/theme-images.js";
import { EMAIL_FONTS } from "../theme.js";

export { buildEml, type EmlImage, type EmlInput } from "./eml.js";

/** The right-hand side of every Content-ID; any stable, unique-ish token works. */
const CID_DOMAIN = "devdogsuga.org";

/**
 * One image the email needs: its SVG source, the width to rasterise at (2x
 * the on-screen size the components declare), and the identity it carries
 * into the MIME parts.
 */
export type EmailImage = { cid: string; filename: string } & (
  | { svg: string; rasterWidth: number }
  /** Already a PNG (the theme images), base64: attached as is. */
  | { png: string }
);

function cidFor(key: string): string {
  return `${key}@${CID_DOMAIN}`;
}

/** Unpack an SVG `<img>` source back into markup a rasteriser can eat. */
function svgFromDataUri(src: string): string {
  const comma = src.indexOf(",");
  const meta = src.slice(0, comma);
  const payload = src.slice(comma + 1);
  return meta.includes(";base64")
    ? Buffer.from(payload, "base64").toString("utf8")
    : decodeURIComponent(payload);
}

/** Every image an exported issue references, exactly once each. */
export function emailImages(): EmailImage[] {
  return [
    ...Object.entries(CAMPAIGN_SVGS).map(([name, svg]) => ({
      cid: cidFor(`campaign-${name}`),
      filename: `campaign-${name}.png`,
      svg,
      rasterWidth: name.startsWith("header") ? 1200 : 600,
    })),
    {
      cid: cidFor("devdogs-lockup"),
      filename: "devdogs-lockup@2x.png",
      svg: svgFromDataUri(DEVDOGS_LOCKUP.src),
      rasterWidth: MARK_SIZES.devdogsLockup.width * 2,
    },
    {
      cid: cidFor("gdgc-lockup"),
      filename: "gdgc-lockup@2x.png",
      svg: svgFromDataUri(GDGC_UGA.src),
      rasterWidth: MARK_SIZES.gdgcLockup.width * 2,
    },
    ...SOCIAL_ICON_NAMES.map((name) => ({
      cid: cidFor(`icon-${name}`),
      filename: `icon-${name}@2x.png`,
      svg: socialIconSvg(name),
      rasterWidth: MARK_SIZES.socialIcon.width * 2,
    })),
    ...PARTNER_NAMES.map((name) => ({
      cid: cidFor(`partner-${name}`),
      filename: `partner-${name}@2x.png`,
      svg: partnerSvg(name),
      rasterWidth: partnerLogoSize(name).width * 2,
    })),
    ...Object.entries(THEME_PNGS)
      .filter(([name]) => !isHostedThemeImage(name))
      .map(([name, png]) => ({
        cid: cidFor(`theme-${name}`),
        filename: `${name}.png`,
        png,
      })),
  ];
}

/**
 * The theme images a send links rather than attaches: the dithered glows,
 * which only a stylesheet `background-image` uses. That is an enhancement
 * classic Outlook and Gmail drop anyway, and an inline part nothing in the
 * body's `<img>`s references shows up in some clients as a stray attachment.
 */
function isHostedThemeImage(name: string): boolean {
  return name.startsWith("glow-");
}

/**
 * The context a send renders with: literal font stacks and `cid:` references
 * matching the `emailImages()` manifest.
 */
export function emailRenderContext(
  imageBase: string = THEME_IMAGE_BASE,
): RenderContext {
  const socialIcon = (name: SocialIconName) => `cid:${cidFor(`icon-${name}`)}`;
  return {
    fonts: EMAIL_FONTS,
    assets: {
      campaignImage: (name) => `cid:${cidFor(`campaign-${name}`)}`,
      devdogsLockup: `cid:${cidFor("devdogs-lockup")}`,
      gdgcLockup: `cid:${cidFor("gdgc-lockup")}`,
      socialIcon,
      partnerLogo: (name: PartnerName) => `cid:${cidFor(`partner-${name}`)}`,
      // Theme <img>s ride as inline parts like every other image: both
      // Outlooks hold linked images behind "download pictures". Only the
      // stylesheet glows stay linked (see isHostedThemeImage).
      themeImage: (name) =>
        isHostedThemeImage(name)
          ? hostedThemeImage(imageBase)(name)
          : `cid:${cidFor(`theme-${name}`)}`,
    },
  };
}

/**
 * The context an on-disk .html preview renders with: the same literal font
 * stacks a mail client would fall down, but self-contained data-URI images so
 * the file opens anywhere with nothing to attach.
 */
export function previewRenderContext(
  imageBase: string = THEME_IMAGE_BASE,
): RenderContext {
  return {
    fonts: EMAIL_FONTS,
    assets: { ...DATA_URI_ASSETS, themeImage: hostedThemeImage(imageBase) },
  };
}

/**
 * Drops the paint, pin and effect rules for utility classes the rendered body
 * never uses. `paintCss`/`darkModeCss` carry a rule per color any theme or chip can
 * paint, three times over (media layer plus two Outlook scopes); one issue
 * uses a fraction, and Gmail clips a message's HTML at ~102KB. Rules are one
 * per line, so this is a line filter over the document's own stylesheet.
 */
export function pruneUnusedPins(html: string): string {
  const bodyStart = html.indexOf("<body");
  const body = html.slice(bodyStart);
  const used = new Set(
    [...body.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(" ")),
  );
  const keep = (line: string) => {
    const match =
      /\.((?:tc|bc|brc)-[0-9a-f]{6}|bgi-glow-[a-z]+|px-sh-[0-9_]+-[0-9a-f]{6}|bg-slants|bg-dots)\{/.exec(
        line,
      );
    return match === null || used.has(match[1]!);
  };
  return (
    html
      .slice(0, bodyStart)
      .replace(
        /(<style[^>]*>)([\s\S]*?)(<\/style>)/g,
        (_, open: string, css: string, close: string) =>
          open + css.split("\n").filter(keep).join("\n") + close,
      ) + body
  );
}

/** An issue as one self-describing HTML document string. */
export function renderIssueDocument(
  issue: ChangelogIssue,
  ctx: RenderContext = emailRenderContext(),
): string {
  return pruneUnusedPins(
    "<!doctype html>" +
      unescapeApostrophes(
        renderToStaticMarkup(<ChangelogDocument issue={issue} ctx={ctx} />),
      ),
  );
}

/**
 * React writes every `'` as `&#x27;`, even in its always double-quoted
 * attributes where a bare one is valid — some 350 times an issue, mostly in
 * the quoted font stacks, which is ~1.8KB toward Gmail's ~102KB clip.
 */
function unescapeApostrophes(html: string): string {
  return html.replaceAll("&#x27;", "'");
}
