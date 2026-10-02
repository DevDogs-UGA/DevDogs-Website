#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { jsonSchemas, schemaText } from "./json-schema.js";

/** `pnpm --filter @devdogsuga/events codegen`: rewrites `data/*.schema.json`. */
for (const [name, schema] of Object.entries(jsonSchemas())) {
  writeFileSync(new URL(`./data/${name}`, import.meta.url), schemaText(schema));
  process.stdout.write(`wrote src/data/${name}\n`);
}
