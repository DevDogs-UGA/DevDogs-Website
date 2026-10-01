import type { Catalog } from "./catalog.js";
import { cliName } from "./cli-name.js";

type Shell = "bash" | "zsh";

/**
 * Groups all paths by their parent prefix to build per-parent completion lists.
 *
 * e.g. ["env", "pull"] contributes "pull" to the group keyed "env".
 */
function buildGroups(catalog: Catalog): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const path of catalog.allPaths()) {
    const parent = path.slice(0, -1).join(" ");
    const name = path[path.length - 1]!;
    const existing = groups.get(parent) ?? [];
    existing.push(name);
    groups.set(parent, existing);
  }
  return groups;
}

function generateBash(catalog: Catalog): string {
  const name = cliName();
  const groups = buildGroups(catalog);
  const topLevel = (groups.get("") ?? []).join(" ");

  const cases: string[] = [];
  for (const [parent, children] of groups) {
    if (!parent) continue;
    // Match "devtools <parent>" — the last typed word before cursor is a subcommand
    cases.push(`        "${parent}") words="${children.join(" ")}" ;;`);
  }

  return [
    `# ${name} bash completion`,
    "# Source this file or add it to /etc/bash_completion.d/",
    `#   eval "$(pnpm ${name} completions --shell bash)"`,
    `_${name}_complete() {`,
    '    local cur="${COMP_WORDS[COMP_CWORD]}"',
    '    local prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '    local words=""',
    "",
    "    # Build the command path from all words except the last",
    '    local cmd=""',
    "    for ((i=1; i<COMP_CWORD; i++)); do",
    '        local w="${COMP_WORDS[$i]}"',
    '        if [[ "$w" != --* ]]; then',
    '            cmd="${cmd:+$cmd }$w"',
    "        fi",
    "    done",
    "",
    '    case "$cmd" in',
    ...cases,
    `        "") words="${topLevel}" ;;`,
    "    esac",
    "",
    '    COMPREPLY=($(compgen -W "$words" -- "$cur"))',
    "}",
    `complete -F _${name}_complete ${name}`,
    "",
  ].join("\n");
}

function generateZsh(catalog: Catalog): string {
  const name = cliName();
  const groups = buildGroups(catalog);
  const topLevel = (groups.get("") ?? []).join(" ");

  const cases: string[] = [];
  for (const [parent, children] of groups) {
    if (!parent) continue;
    cases.push(`        "${parent}") candidates=(${children.join(" ")}) ;;`);
  }

  return [
    `#compdef ${name}`,
    `# ${name} zsh completion`,
    "# Add to your .zshrc:",
    `#   eval "$(pnpm ${name} completions --shell zsh)"`,
    `_${name}() {`,
    "    local state",
    `    local -a top_level=(${topLevel})`,
    "",
    "    # Build the command path from all words except the last",
    '    local cmd=""',
    "    local -i i",
    "    for ((i=2; i<CURRENT; i++)); do",
    '        local w="${words[$i]}"',
    '        if [[ "$w" != --* ]]; then',
    '            cmd="${cmd:+$cmd }$w"',
    "        fi",
    "    done",
    "",
    '    local -a candidates=("${top_level[@]}")',
    '    case "$cmd" in',
    ...cases,
    "        *) ;;",
    "    esac",
    "",
    "    compadd -a candidates",
    "}",
    `_${name}`,
    "",
  ].join("\n");
}

export function generateCompletions(catalog: Catalog, shell: Shell): string {
  return shell === "zsh" ? generateZsh(catalog) : generateBash(catalog);
}

export function runCompletions(catalog: Catalog, argv: string[]): number {
  const shellIdx = argv.indexOf("--shell");
  const shell = shellIdx !== -1 ? argv[shellIdx + 1] : undefined;

  if (shell !== "bash" && shell !== "zsh") {
    const name = cliName();
    process.stderr.write(
      `${name} completions: --shell must be bash or zsh.\n` +
        `Example: pnpm ${name} completions --shell bash\n`,
    );
    return 1;
  }

  process.stdout.write(generateCompletions(catalog, shell));
  return 0;
}
