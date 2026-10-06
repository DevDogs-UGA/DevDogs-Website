// Keeps the `devdogsuga/` link pointing at a DevDogsUGA checkout.
//
// The platform is developed here, but its database (supabase/), docs and the
// generated Supabase types stay in DevDogsUGA. Platform packages reach them
// through `devdogsuga/` (link: dependencies, ../../devdogsuga/... paths), so
// the path has to exist and be the same on every machine and in CI.
//
//   Locally  `devdogsuga` is a gitignored symlink to the sibling clone
//            ../DevDogsUGA, or to $DEVDOGSUGA_DIR when set.
//   In CI    DevDogsUGA is checked out straight into `devdogsuga/` at the SHA
//            in devdogsuga.lock; a real directory there is left alone.
//
// devdogsuga.lock holds the one full SHA this commit of Backstage is built
// against. A sibling on any other commit only warns: that is the normal state
// while a migration is being written on the DevDogsUGA side.
//
// Runs from the root `preinstall` (so a bad link fails before pnpm resolves
// the `link:` dependencies) and as `pnpm devdogsuga` for a status report.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const linkPath = join(root, "devdogsuga");
const lockPath = join(root, "devdogsuga.lock");
const target = resolve(
  root,
  process.env.DEVDOGSUGA_DIR || join("..", "DevDogsUGA"),
);

const fail = (message) => {
  console.error(`devdogsuga: ${message}`);
  process.exit(1);
};
const warn = (message) => console.warn(`devdogsuga: warning: ${message}`);

if (!existsSync(lockPath)) fail("devdogsuga.lock is missing.");
const lock = readFileSync(lockPath, "utf8").trim();
if (!/^[0-9a-f]{40}$/.test(lock)) {
  fail("devdogsuga.lock must contain one full 40-character commit SHA.");
}

const stat = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
};

const existing = stat(linkPath);
if (existing?.isSymbolicLink()) {
  const current = resolve(dirname(linkPath), readlinkSync(linkPath));
  if (current !== target) {
    // The link is ours and gitignored, so repointing it is safe.
    rmSync(linkPath);
    symlinkSync(target, linkPath, "junction");
  }
} else if (!existing) {
  if (!existsSync(target)) {
    fail(
      `no DevDogsUGA checkout at ${target}.\n` +
        "  Clone it next to this repo (git clone https://github.com/DevDogsUGA/DevDogsUGA ../DevDogsUGA)\n" +
        "  or set DEVDOGSUGA_DIR to where it lives, then run pnpm install again.",
    );
  }
  symlinkSync(target, linkPath, "junction");
} else if (!existing.isDirectory()) {
  fail(`${linkPath} exists and is neither a symlink nor a directory.`);
}
// else: a real directory, i.e. CI's checkout. Validated below, never replaced.

const dir = realpathSync(linkPath);
for (const marker of ["supabase/config.toml", "docs/package.json"]) {
  if (!existsSync(join(dir, marker))) {
    fail(`${dir} does not look like DevDogsUGA (no ${marker}).`);
  }
}

// The linked packages resolve their own dependencies from the DevDogsUGA
// tree, so it has to have been installed.
if (!existsSync(join(dir, "node_modules"))) {
  fail(`${dir} has no node_modules; run pnpm install there first.`);
}

try {
  const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (head !== lock) {
    warn(
      `${dir} is at ${head.slice(0, 8)}, the lock pins ${lock.slice(0, 8)}. ` +
        "Expected while authoring migrations; update devdogsuga.lock when the change lands.",
    );
  }
} catch {
  warn(`${dir} is not a git checkout, so it cannot be compared to the lock.`);
}

if (process.argv.includes("--status")) {
  console.log(`devdogsuga -> ${dir}\nlock: ${lock}`);
}
