import type { EmailTemplates } from "./email-types.js";

/**
 * Credible, non-sensitive values for local previews.
 *
 * `satisfies` is the maintenance mechanism: a new template or prop cannot be
 * shipped without deciding what its preview should say.
 */
export const EMAIL_FIXTURES = {
  JoinRequest: {
    leadName: "Jordan",
    applicantName: "Avery",
    teamName: "Byte Bulldogs",
    competitionName: "UGAHacks",
    reviewUrl: "https://devdogsuga.org/teams/byte-bulldogs/requests",
  },
  TeamInvite: {
    inviteeName: "Avery",
    teamName: "Byte Bulldogs",
    competitionName: "UGAHacks",
    leadName: "Jordan",
    acceptUrl: "https://devdogsuga.org/invitations/example",
  },
} satisfies EmailTemplates;
