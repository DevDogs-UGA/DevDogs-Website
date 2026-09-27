# @devdogsuga/docs-compiler

Compiles a folder of markdown into a typed data module.

Three modes, one binary. Bare `docs-compiler` compiles the markdown in the working
directory into `dist/` — that is the whole of `docs/`'s build step, which is why
that package holds no code. The other two are what you run by hand, both from
`docs/`:

```bash
pnpm exec docs-compiler check   # lint the hand-written pages for length and collapsible defects
pnpm exec docs-compiler gen     # regenerate the reference sections from each source tree
```

`pnpm exec` is what puts the bin on `PATH`; it is linked into
`docs/node_modules/.bin` and nowhere else, so the bare name is
"command not found". The old package name, `docs-build`, still works as a
`bin` alias.

`check` is warn-only and always exits 0; `gen --dry-run` writes nothing.
`gen` only covers shared packages (the `toolkit` project) — apps no longer
get a generated reference.

Bare `docs-compiler` also runs two checks that DO fail the build: broken
internal links (`/docs/<project>/<path>#anchor` and relative `*.md` links have
to resolve, mounting from `docs/_shared/**` included) and a documented
`pnpm devtools …` / `pnpm --filter … <script>` / `pnpm run <script>` that does
not match a real command or script. Opt a fenced sample out with a `nocheck`
fence-info word (` ```sh nocheck `).

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/docs-compiler) ·
[Docs system](../../docs/monorepo/guides/docs-system/index.md)
