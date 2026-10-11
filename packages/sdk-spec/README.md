# @devdogsuga/sdk-spec

The source of truth for the two SDKs, and the one generator that writes them. Private: nothing here is
published; it produces `packages/sdk` (TypeScript) and `packages/sdk_dart` (Dart).

## What is in it

| File                         | Authored or exported          | Becomes                                                         |
| ---------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `openapi/catalog.yaml`       | authored                      | the catalog client and models (`sdk/catalog`, `catalog.dart`)   |
| `openapi/platform.yaml`      | authored                      | the platform client and types (`sdk/platform`, `platform.dart`) |
| `constants.json`             | authored                      | `sdk/constants`, `constants.dart`                               |
| `telemetry/scrub-cases.json` | authored                      | test cases both SDKs' scrubbers must satisfy                    |
| `moderation/schema.json`     | exported from zod             | the Dart moderation models; `platform.yaml` references it       |
| `brand/tokens.json`          | exported from `sdk/brand`     | `brand_tokens.dart`: palette, theme, apps, mark SVGs, fonts     |
| `telemetry/scrub.json`       | exported from `sdk/telemetry` | `scrub_rules.dart`                                              |

The exported files are derived from the TypeScript sources first (those stay the source: that is where
they are used and tested), so editing a zod schema or a palette value without regenerating is drift too.
The generator also copies the brand artwork (SVG) and the three font faces into `packages/sdk_dart/lib/assets`.

## Commands

```sh
pnpm -F @devdogsuga/sdk-spec codegen   # write everything
pnpm -F @devdogsuga/sdk-spec check:drift      # write nothing; fail if anything differs (CI)
pnpm -F @devdogsuga/sdk-spec test
```

`check` also fails for a file the generator owns but no longer writes, and when `apps/catalog/openapi/catalog.yaml`
exists and differs from `openapi/catalog.yaml` (there must be one copy of the contract).

## Writing a spec

The generator understands the subset these files use and throws on anything else rather than guessing:
objects, arrays, string enums, the four scalar types, `oneOf`/`anyOf` (with `{type: "null"}` meaning nullable,
or a union of objects with a discriminating enum), `additionalProperties` maps, and `$ref` to
`#/components/schemas/*` or to another file's `#/$defs/*`.

- Inline objects and enums are hoisted into named types (`Section.campus` is `SectionCampus`), because Dart has
  no anonymous classes and the two languages should agree on names.
- Schemas named `Date`, `Time` and `Error` are renamed (`DateString`, `TimeString`, `ErrorBody`): they would
  shadow a builtin in one language or the other.
- `x-sdk-client: false` on an operation keeps it out of the generated clients (a report needs a signature, and
  signing is TypeScript-only).
- `x-sdk-schemas` at the top of an OpenAPI file lists schemas no operation mentions but the SDKs still ship.
- In flow-style YAML (`{ description: a, b }`) a comma ends the value. Quote any description that has one; a test
  fails the build if a key ended up with an empty value.

Dart conversions: `integer` is `int`, `number` is `double`, `date-time` strings are `DateTime`, dates and times stay
`String`. A required property is `required`; an optional or nullable one is `T?` (a null optional property is left
out of `toJson`).
