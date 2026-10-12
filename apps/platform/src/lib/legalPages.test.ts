// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The legal pages cover everything Q86 asks of them.
 *
 * The pages are static JSX, so this reads their source and checks it. What it
 * pins is the contract other repos and the Post-flight notice depend on:
 *
 *   - `/legal/privacy#dogpack` is the app-store privacy URL, and
 *     `/legal/privacy#dogdays` and the Terms' own `#dogpack`/`#dogdays` are
 *     what the apps link to;
 *   - Privacy section 11 stays "Changes to this policy", because the Discord
 *     notice cites it by number;
 *   - DogPack's section states what the app collects, including that it does
 *     not ask for an age (the Home Page brief's onboarding did), and the
 *     Google Maps terms DogDays' map requires us to link;
 *   - nothing still describes the deleted Teams and competitions features.
 */

const LEGAL = join(import.meta.dirname, "..", "app", "(site)", "legal");

/** A page's visible text: tags dropped, JSX entities and string braces undone. */
function visibleText(file: string): string {
  return readFileSync(join(LEGAL, file, "page.tsx"), "utf8")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{" "\}/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, "-")
    .replace(/\s+/g, " ");
}

const source = (file: string) =>
  readFileSync(join(LEGAL, file, "page.tsx"), "utf8");

/** The text between two section ids, so a claim has to be in the right place. */
function section(text: string, from: string, to?: string): string {
  const start = text.indexOf(from);
  expect(start, `${from} is missing`).toBeGreaterThanOrEqual(0);
  const end = to ? text.indexOf(to, start) : -1;
  return text.slice(start, end === -1 ? undefined : end);
}

const privacy = source("privacy");
const terms = source("terms");
const privacyText = visibleText("privacy");
const termsText = visibleText("terms");

describe("anchors the apps and the notice rely on", () => {
  it("gives Privacy and Terms a DogDays and a DogPack section", () => {
    for (const html of [privacy, terms]) {
      expect(html).toContain('id="dogdays"');
      expect(html).toContain('id="dogpack"');
    }
  });

  it("names the app-store privacy URL in the DogPack section", () => {
    expect(privacy).toContain("devdogsuga.org/legal/privacy#dogpack");
  });

  it("lets the Terms link into the Privacy sections", () => {
    expect(terms).toContain("/legal/privacy#dogdays");
    expect(terms).toContain("/legal/privacy#dogpack");
  });

  it("keeps section 11 as the Discord-announced change notice", () => {
    expect(privacy).toContain('id="11-changes-to-this-policy"');
    const eleven = section(
      privacyText,
      "11. Changes to this policy",
      "12. Questions",
    );
    expect(eleven).toContain("Discord");
  });

  it("covers both apps in the opening scope list", () => {
    const scope = section(privacyText, "It covers:", "Using these services");
    expect(scope).toContain("DogDays");
    expect(scope).toContain("DogPack");
  });
});

describe("the DogPack section", () => {
  const dogpack = section(privacyText, "14. DogPack");

  it("lists what it collects", () => {
    for (const term of [
      "class year",
      "major",
      "enrolled",
      "course codes",
      "Study sessions",
      "Reports and blocks",
    ]) {
      expect(dogpack, term).toContain(term);
    }
  });

  it("says it does not ask for an age", () => {
    expect(dogpack).toMatch(/doesn't ask for your age/);
  });

  it("says who can see sessions, and how data is deleted", () => {
    expect(dogpack).toContain("enrolled in the same course");
    expect(dogpack).toContain("Delete my data");
    expect(dogpack).toContain("Firebase App Distribution");
  });

  it("covers reporting and blocking through the platform's moderation", () => {
    expect(dogpack).toContain("moderation");
    expect(dogpack).toContain("block");
  });
});

describe("the DogDays section", () => {
  const dogdays = section(privacyText, "13. DogDays", "14. DogPack");

  it("covers saved plans and the local-storage mode", () => {
    expect(dogdays).toContain("schedule plans");
    expect(dogdays).toContain("local storage");
  });

  it("links Google's terms for the map, in both documents", () => {
    for (const html of [privacy, terms]) {
      expect(html).toContain("https://maps.google.com/help/terms_maps/");
    }
    expect(privacy).toContain("https://policies.google.com/privacy");
  });
});

describe("what the apps receive at sign-in", () => {
  // The OAuth server's ID token carries the sign-in provider's name and
  // picture, not the platform's preferred name, so the copy must not say it.
  it("names the provider name and picture, and never the preferred name", () => {
    const flow = section(
      privacyText,
      "DevDogs apps and developer testing",
      "5. Support conversations",
    );
    const dogdays = section(privacyText, "13. DogDays", "14. DogPack");
    const dogpack = section(privacyText, "14. DogPack");
    for (const text of [flow, dogdays, dogpack]) {
      expect(text).toMatch(/name and profile picture/);
      expect(text).not.toMatch(/ID, (a )?UGA email and preferred name/);
    }
    expect(dogdays).not.toMatch(/can't see anything else/);
  });

  // The access token and userinfo response the apps get carry the provider
  // identifier and the linked-provider list as well (lane 3e review), so the
  // copy must not claim the apps receive nothing but the four listed items.
  it("discloses the provider identifier and linked providers, and never says 'only'", () => {
    const flow = section(
      privacyText,
      "DevDogs apps and developer testing",
      "5. Support conversations",
    );
    const dogdays = section(privacyText, "13. DogDays", "14. DogPack");
    const dogpack = section(privacyText, "14. DogPack");
    for (const text of [flow, dogdays, dogpack]) {
      expect(text).toMatch(/Google.s (?:own )?identifier/);
      expect(text).toMatch(/GitHub, Discord,? (?:or|and)? ?LinkedIn/);
    }
    expect(flow).not.toMatch(/receive only your/);
  });
});

describe("the deleted features are gone from the legal copy", () => {
  it.each([
    ["privacy", privacyText],
    ["terms", termsText],
  ])("%s does not describe teams or competitions", (_name, text) => {
    expect(text).not.toMatch(/competition/i);
    expect(text).not.toMatch(/team repositor/i);
    expect(text).not.toMatch(/two-factor authentication/i);
    expect(text).not.toMatch(
      /invite you to the DevDogs (?:GitHub )?organization/i,
    );
  });
});
