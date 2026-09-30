import { describe, expect, it } from "vitest";
import { parseGithubRemote, remotesMatchRepo } from "./remote.js";

describe("parseGithubRemote", () => {
  it.each([
    "https://github.com/DevDogsUGA/Web-Workshops",
    "https://github.com/DevDogsUGA/Web-Workshops.git",
    "https://github.com/DevDogsUGA/Web-Workshops/",
    "https://user:token@github.com/DevDogsUGA/Web-Workshops.git",
    "http://github.com/DevDogsUGA/Web-Workshops.git",
    "git@github.com:DevDogsUGA/Web-Workshops.git",
    "git@github.com:DevDogsUGA/Web-Workshops",
    "github.com:DevDogsUGA/Web-Workshops.git",
    "ssh://git@github.com/DevDogsUGA/Web-Workshops.git",
    "ssh://git@ssh.github.com:443/DevDogsUGA/Web-Workshops.git",
    "  https://GitHub.com/DevDogsUGA/Web-Workshops.git\n",
  ])("reads %s", (url) => {
    expect(parseGithubRemote(url)).toBe("DevDogsUGA/Web-Workshops");
  });

  it.each([
    "https://gitlab.com/DevDogsUGA/Web-Workshops.git",
    "https://github.com.evil.com/DevDogsUGA/Web-Workshops",
    "https://github.com/DevDogsUGA",
    "https://github.com/DevDogsUGA/Web-Workshops/tree/main",
    "/home/me/Web-Workshops",
    "../Web-Workshops",
    "file:///srv/Web-Workshops.git",
    "",
  ])("rejects %s", (url) => {
    expect(parseGithubRemote(url)).toBeNull();
  });
});

describe("remotesMatchRepo", () => {
  it("matches any remote, case-insensitively", () => {
    const urls = [
      "git@github.com:someone/fork.git",
      "https://github.com/devdogsuga/web-workshops.git",
    ];
    expect(remotesMatchRepo(urls, "DevDogsUGA/Web-Workshops")).toBe(true);
    expect(remotesMatchRepo(urls, "DevDogsUGA/Mobile-Workshops")).toBe(false);
    expect(remotesMatchRepo([], "DevDogsUGA/Web-Workshops")).toBe(false);
  });
});
