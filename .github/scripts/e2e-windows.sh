#!/usr/bin/env bash
# The part of the end-to-end setup check that needs no Docker, so it can run on
# GitHub's Windows runners (which cannot run Supabase's Linux images). Run from
# a checkout of a product (DogDays or DogPack) with DEVTOOLS_TARBALL set to a
# packed devtools. Windows is where `npx`, `pnpm` and `supabase` are .cmd shims
# that Node cannot spawn by name, so every step here starts a program.
#
#   --version, bare `devtools` with no terminal, `doctor`,
#   `db types --download`, and resolving and spawning the pinned Supabase CLI.
set -uo pipefail

: "${DEVTOOLS_TARBALL:?DEVTOOLS_TARBALL must name the packed devtools}"
# On Windows runners `runner.temp` is a C:\ path; bash wants the other spelling.
if command -v cygpath >/dev/null 2>&1; then DEVTOOLS_TARBALL=$(cygpath -m "$DEVTOOLS_TARBALL"); fi

failed=0
CRASH='ENOENT|RepoNotFoundError|^ +at '

devtools() { pnpm --config.ignore-scripts=true dlx "$DEVTOOLS_TARBALL" "$@"; }

# run <label> <expected exit codes, space separated> <must contain regex> -- args...
run() {
  local label=$1 codes=$2 want=$3
  shift 4
  local out code
  out=$(devtools "$@" </dev/null 2>&1)
  code=$?
  local problems=()
  [[ " $codes " == *" $code "* ]] || problems+=("exit $code, wanted $codes")
  grep -Eq -- "$want" <<<"$out" || problems+=("output lacks /$want/")
  if grep -Eq -- "$CRASH" <<<"$out"; then problems+=("output looks like a crash"); fi
  if [ ${#problems[@]} -gt 0 ]; then
    failed=1
    echo "FAIL  $label: ${problems[*]}"
    echo "$out" | sed 's/^/      /'
  else
    echo "ok    $label"
  fi
}

pin=$(node -p "require('./devtools.config.json').supabase.version")
types_out=$(node -p "require('./devtools.config.json').types.out")

run "--version" "0" '^[0-9]+\.[0-9]+\.[0-9]+' -- --version
run "bare devtools, no terminal" "0" "setup" --
# doctor reports the missing Docker; that is a finding, not a crash.
run "doctor" "0 1" 'Docker|OK' -- doctor
run "supabase --version (resolves and spawns the pinned CLI)" "0" "$pin" -- supabase --version
run "db types --download" "0" 'ownload' -- db types --download
if [ ! -s "$types_out" ] && [ ! -d "$types_out" ]; then
  failed=1
  echo "FAIL  db types --download wrote nothing at $types_out"
elif [ -d "$types_out" ] && [ -z "$(ls "$types_out")" ]; then
  failed=1
  echo "FAIL  db types --download left $types_out empty"
else
  echo "ok    $types_out is present"
fi

exit $failed
