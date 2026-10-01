import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { logoHref, parseQrArgs, runQr, textGiven } from "./commands.js";

const CWD = "/somewhere";

describe("parseQrArgs", () => {
  it("takes the text as the argument, or as --text", () => {
    expect(parseQrArgs(["https://devdogsuga.org"], CWD).request.text).toBe(
      "https://devdogsuga.org",
    );
    expect(parseQrArgs(["--text", "hello"], CWD).request.text).toBe("hello");
    expect(textGiven(["--size", "300"])).toBeUndefined();
  });

  it("leaves everything unset for the schema's defaults", () => {
    const { request, out, name } = parseQrArgs(["hi"], CWD);
    expect(request).toEqual({ text: "hi" });
    expect(out).toBe(CWD);
    expect(name).toBe("qr");
  });

  it("reads every option of the shared schema", () => {
    const { request } = parseQrArgs(
      [
        "hi",
        "--theme",
        "acm-dark",
        "--size",
        "512",
        "--margin",
        "4",
        "--color",
        "#112233",
        "--background",
        "#ffffff",
        "--gradient",
        "#cb0027,#00a4ad",
        "--shape",
        "square",
        "--logo",
        "acm",
        "--logo-size",
        "7",
        "--logo-padding",
        "2",
        "--error-level",
        "Q",
        "--qr-version",
        "6",
        "--format",
        "svg,png,jpg,webp,avif,tiff",
      ],
      CWD,
    );
    expect(request).toEqual({
      text: "hi",
      theme: "acm-dark",
      size: 512,
      margin: 4,
      color: "#112233",
      background: "#ffffff",
      gradient: ["#cb0027", "#00a4ad"],
      shape: "square",
      logo: "acm",
      logoSize: 7,
      logoPadding: 2,
      errorLevel: "Q",
      version: 6,
      formats: ["svg", "png", "jpg", "webp", "avif", "tiff"],
    });
  });

  it("treats a transparent background as the console does: an empty one", () => {
    expect(
      parseQrArgs(["hi", "--background", "transparent"], CWD).request
        .background,
    ).toBe("");
  });

  it("takes a logo file, tells the schema there is no preset, and reads the crop", () => {
    const parsed = parseQrArgs(
      ["hi", "--logo", "./mark.png", "--logo-crop", "0,24,265,265"],
      CWD,
    );
    expect(parsed.request.logo).toBe("none");
    expect(parsed.logoFile).toEqual({
      path: "/somewhere/mark.png",
      crop: { x: 0, y: 24, width: 265, height: 265 },
    });
  });

  it("names the flag when the schema refuses a value", () => {
    expect(() => parseQrArgs(["hi", "--size", "5"], CWD)).toThrow("--size");
    expect(() => parseQrArgs(["hi", "--format", "gif"], CWD)).toThrow(
      "--format",
    );
    expect(() => parseQrArgs(["hi", "--error-level", "Z"], CWD)).toThrow(
      "--error-level",
    );
    expect(() => parseQrArgs(["hi", "--size", "big"], CWD)).toThrow(
      "takes a number",
    );
    expect(() => parseQrArgs([], CWD)).toThrow("Enter something");
  });

  it("refuses a crop with no file, a malformed crop, and a one-colour gradient", () => {
    expect(() => parseQrArgs(["hi", "--logo-crop", "0,0,9,9"], CWD)).toThrow(
      "crops a logo file",
    );
    expect(() =>
      parseQrArgs(["hi", "--logo", "a.png", "--logo-crop", "1,2,3"], CWD),
    ).toThrow("four whole numbers");
    expect(() => parseQrArgs(["hi", "--gradient", "#fff"], CWD)).toThrow(
      "two colours",
    );
  });

  it("refuses two texts rather than guessing", () => {
    expect(() => parseQrArgs(["a", "b"], CWD)).toThrow("one argument");
  });
});

describe("runQr", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "qr-test-"));
    process.exitCode = undefined;
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("writes svg and png by default", async () => {
    await runQr(["https://devdogsuga.org"], { cwd: dir });
    expect((await readdir(dir)).sort()).toEqual(["qr.png", "qr.svg"]);
    expect(process.exitCode).toBeUndefined();
  });

  it("writes every format at once, with a name and a directory", async () => {
    await runQr(
      [
        "hi",
        "--format",
        "svg,png,jpg,webp,avif,tiff",
        "--size",
        "128",
        "--name",
        "code",
        "--out",
        "out",
      ],
      { cwd: dir },
    );
    expect((await readdir(join(dir, "out"))).sort()).toEqual([
      "code.avif",
      "code.jpg",
      "code.png",
      "code.svg",
      "code.tiff",
      "code.webp",
    ]);
    const png = sharp(await readFile(join(dir, "out", "code.png")));
    expect((await png.metadata()).width).toBe(128);
  });

  it("applies a gradient, a background and a square shape", async () => {
    await runQr(
      [
        "hi",
        "--gradient",
        "#cb0027,#00a4ad",
        "--background",
        "#ffffff",
        "--shape",
        "square",
        "--format",
        "svg",
      ],
      { cwd: dir },
    );
    const svg = await readFile(join(dir, "qr.svg"), "utf8");
    expect(svg).toContain("qr-gradient");
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain("M4.5,14h5.1C12");
  });

  it("puts a preset logo in the middle, and none when told none", async () => {
    await runQr(["hi", "--logo", "devdogs", "--format", "svg"], { cwd: dir });
    expect(await readFile(join(dir, "qr.svg"), "utf8")).toContain("<image");
    await runQr(["hi", "--logo", "none", "--format", "svg", "--name", "bare"], {
      cwd: dir,
    });
    expect(await readFile(join(dir, "bare.svg"), "utf8")).not.toContain(
      "<image",
    );
  });

  it("embeds a logo file, cropped to the region asked for", async () => {
    const source = await sharp({
      create: {
        width: 40,
        height: 60,
        channels: 3,
        background: "#ff0000",
      },
    })
      .png()
      .toBuffer();
    await writeFile(join(dir, "logo.png"), source);

    const href = await logoHref({
      path: join(dir, "logo.png"),
      crop: { x: 0, y: 10, width: 40, height: 40 },
    });
    const cropped = Buffer.from(href.split(",")[1]!, "base64");
    expect(href.startsWith("data:image/png;base64,")).toBe(true);
    const meta = await sharp(cropped).metadata();
    expect([meta.width, meta.height]).toEqual([40, 40]);

    await runQr(
      [
        "hi",
        "--logo",
        "logo.png",
        "--logo-crop",
        "0,10,40,40",
        "--format",
        "svg",
      ],
      { cwd: dir },
    );
    expect(await readFile(join(dir, "qr.svg"), "utf8")).toContain(
      "data:image/png;base64",
    );
  });

  it("refuses a crop that runs off the logo", async () => {
    const source = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    await writeFile(join(dir, "logo.png"), source);
    await expect(
      logoHref({
        path: join(dir, "logo.png"),
        crop: { x: 5, y: 5, width: 10, height: 10 },
      }),
    ).rejects.toThrow("runs outside the 10x10 logo");
  });

  it("fails, writing nothing, for a logo that is neither a preset nor a file", async () => {
    await runQr(["hi", "--logo", "nowhere.png"], { cwd: dir });
    expect(process.exitCode).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it("fails for invalid options", async () => {
    await runQr(["hi", "--size", "5"], { cwd: dir });
    expect(process.exitCode).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it("writes nothing under --dry-run", async () => {
    await runQr(["hi", "--dry-run"], { cwd: dir });
    expect(await readdir(dir)).toEqual([]);
  });
});
