// Rasterise one SVG to PNG at a given width: node rasterize.mjs <in.svg> <out.png> <width>
// Uses the @resvg/resvg-js already in the workspace's pnpm store.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../../../", import.meta.url).pathname;
const store = join(root, "node_modules/.pnpm");
const dir = readdirSync(store).find((d) => d.startsWith("@resvg+resvg-js@"));
const { Resvg } = createRequire(join(store, dir, "node_modules/"))("@resvg/resvg-js");
const [, , input, output, width] = process.argv;
const png = new Resvg(readFileSync(input), { fitTo: { mode: "width", value: Number(width) } }).render().asPng();
writeFileSync(output, png);
