# @devdogsuga/airtable

The Airtable field registry, sync engine and base verifier.

One table spec per synced table declares every field and its direction, and the
sync functions iterate that spec — so adding a field is a change to the spec,
not to the code that moves records:

```ts
import { applyPull, meetings } from "@devdogsuga/airtable";
```

`AirtableClient` is the typed REST wrapper underneath; `scaffoldBase` and
`discoverIds` back the `pnpm devtools airtable` subcommands, which is how the
base gets created and its ids pulled back into the registry.

`schema-snapshot.json` ships with the package: it is the committed copy of the
base's shape that `snapshotDrift` checks the registry against without a
credential. This base's home repo is Backstage, so the registry and its
snapshot are the one piece of DevDogs-specific data that publishes.

## `@devdogsuga/airtable/officer-change`

A separate subpath, because the root is the base treaty and needs no validator:

```ts
import { createOfficerChangeGrammar } from "@devdogsuga/airtable/officer-change";
```

The officer-change command grammar turns one Airtable form response into a
validated, normalized command. It holds no identity policy — bind it once to
your own identifier resolver and reuse that binding, since two resolvers
would let the same response normalize two ways:

```ts
const grammar = createOfficerChangeGrammar({ resolveMemberIdentity: myIdToEmail });
```

Applying a command — receipts, leases, refusals, account creation, any
database effect — is the consumer's job and deliberately lives nowhere near
this package.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/airtable)
