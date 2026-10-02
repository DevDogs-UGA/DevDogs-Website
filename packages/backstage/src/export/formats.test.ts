import { describe, expect, it } from "vitest";
import {
  BEVY,
  INVOLVEMENT,
  parseFormats,
  splitName,
  ugaEmail,
} from "./formats.js";

describe("formats", () => {
  it("prefers the profile's MyID email, then a uga.edu sign-in", () => {
    expect(ugaEmail({ uga_email: "ADA@uga.edu", email: "a@gmail.com" })).toBe(
      "ada@uga.edu",
    );
    expect(ugaEmail({ uga_email: null, email: "Ada@UGA.edu" })).toBe(
      "ada@uga.edu",
    );
    expect(ugaEmail({ uga_email: null, email: "a@gmail.com" })).toBeNull();
  });

  it("splits the preferred name only when the profile has no first or last name", () => {
    expect(splitName({ first_name: "Ada", last_name: "Lovelace" })).toEqual([
      "Ada",
      "Lovelace",
    ]);
    expect(splitName({ preferred_name: "Ada King Lovelace" })).toEqual([
      "Ada",
      "King Lovelace",
    ]);
    expect(splitName({ preferred_name: "Ada" })).toEqual(["Ada", ""]);
  });

  it("leaves people without a UGA email out of the Involvement Network list, and counts them", () => {
    const writer = INVOLVEMENT.writer();
    const out = writer.page([
      { user_id: "a", uga_email: "a@uga.edu" },
      { user_id: "b", email: "b@gmail.com" },
      { user_id: "b", email: "b@gmail.com" },
      { user_id: "a", uga_email: "a@uga.edu" },
    ]);
    expect(out).toEqual({ text: "a@uga.edu\r\n", count: 1 });
    expect(writer.skipped()).toBe(1);
  });

  it("falls back to the sign-in email for Bevy", () => {
    const out = BEVY.writer().page([
      { user_id: "b", email: "B@gmail.com", preferred_name: "Bo" },
    ]);
    expect(out.text).toBe("Bo,,b@gmail.com,TRUE,,,,\r\n");
  });

  it("takes commas and repeats, once each", () => {
    expect(parseFormats(["bevy, platform", "bevy"])).toEqual([
      "bevy",
      "platform",
    ]);
    expect(() => parseFormats(["csv"])).toThrow('Unknown format "csv"');
  });
});
