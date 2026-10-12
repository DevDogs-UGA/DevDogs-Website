#!/usr/bin/env node
// The next prerelease tag for the Dart SDK: `devdogsuga_sdk-v<base>-next.<n>`.
//
//   node scripts/dart-next-tag.mjs           # print it
//   node scripts/dart-next-tag.mjs --push    # tag HEAD and push the tag
//
// <base> is the version in packages/sdk_dart/pubspec.yaml; <n> is one past the
// highest `-next.<n>` tag already pushed for that base. Pushing the tag is what
// starts `.github/workflows/publish-dart.yaml` (pub.dev's automated publishing
// only accepts a tag push). HEAD must already be on `origin/main`: the workflow
// refuses a tag that is not.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const PREFIX = "devdogsuga_sdk-v";

export function baseVersion(pubspec) {
  const version = /^version:\s*(\d+\.\d+\.\d+)\s*$/m.exec(pubspec)?.[1];
  if (!version) {
    throw new Error(
      "pubspec.yaml has no plain `version: X.Y.Z` (prerelease versions come from the tag).",
    );
  }
  return version;
}

export function nextTag(base, existingTags) {
  const taken = existingTags
    .map(
      (tag) =>
        new RegExp(
          `^${PREFIX}${base.replaceAll(".", "\\.")}-next\\.(\\d+)$`,
        ).exec(tag)?.[1],
    )
    .filter(Boolean)
    .map(Number);
  return `${PREFIX}${base}-next.${Math.max(0, ...taken) + 1}`;
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const base = baseVersion(
    readFileSync(`${repoRoot}packages/sdk_dart/pubspec.yaml`, "utf8"),
  );
  git(["fetch", "--tags", "--quiet", "origin"]);
  const tag = nextTag(
    base,
    git(["tag", "--list", `${PREFIX}*`])
      .split("\n")
      .filter(Boolean),
  );
  if (!process.argv.includes("--push")) {
    console.log(tag);
  } else {
    git(["fetch", "--quiet", "origin", "main"]);
    try {
      git(["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
    } catch {
      throw new Error(
        "HEAD is not on origin/main; a prerelease is a main build.",
      );
    }
    git(["tag", tag]);
    git(["push", "origin", tag]);
    console.log(`Pushed ${tag}`);
  }
}
