/**
 * Which published CLI this process is, for the few strings the shared core
 * prints in its own voice: the release a Sentry event names, the command a
 * safety-gate message quotes. Each CLI's launcher sets it once, first thing;
 * the default is `devtools`, so a core module run from a test or from
 * devtools itself needs no setup.
 */
export type CliName = "devtools" | "backstage";

let current: CliName = "devtools";

export function setCliName(name: CliName): void {
  current = name;
}

export function cliName(): CliName {
  return current;
}
