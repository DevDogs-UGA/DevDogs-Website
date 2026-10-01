/**
 * `newsletter`'s place in the command tree: declaration only, nothing here
 * runs. The handler lives in `commands.ts` beside it.
 *
 * Every subcommand is `envFree`: the club mailbox is reached with the
 * officer's own Microsoft sign-in, not an env file or a deploy tier.
 */
import { YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const newsletterCommand: CommandNode = {
  name: "newsletter",
  summary: "Render, draft or send a DevDogs Changelog issue.",
  hint: "needs the club mailbox sign-in for draft and send",
  subcommands: [
    {
      name: "render",
      envFree: true,
      summary: "Write an issue as .eml and .html files.",
      hint: "writes files only",
      options: [
        {
          flag: "--format",
          value: "<eml,html>",
          summary: "Which files. Defaults to both.",
          prompt: {
            kind: "select",
            message: "Which files?",
            choices: [
              { value: "eml,html", label: "Both" },
              { value: "eml", label: "Outlook draft (.eml)" },
              { value: "html", label: "HTML preview" },
            ],
          },
        },
        {
          flag: "--out",
          value: "<dir>",
          summary: "Directory for the files. Defaults to ./changelog-exports.",
          prompt: {
            kind: "text",
            message: "Where should the files go?",
            placeholder: "./changelog-exports",
            optional: true,
          },
        },
      ],
    },
    {
      name: "draft",
      envFree: true,
      summary: "Append an issue to the club mailbox's Drafts.",
      hint: "review it in any Outlook",
    },
    {
      name: "send",
      envFree: true,
      summary: "Send an issue from the club mailbox, as authored.",
      hint: "asks first, naming the issue and every recipient",
      options: [
        {
          flag: "--to",
          value: "<a@…,b@…>",
          summary:
            "Recipients, comma-separated. Required; there is no default.",
          prompt: {
            kind: "text",
            message: "Who should receive it? (comma-separated addresses)",
          },
        },
        YES,
      ],
    },
  ],
};
