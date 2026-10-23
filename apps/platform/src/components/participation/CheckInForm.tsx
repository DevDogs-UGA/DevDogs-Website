"use client";

import "./passport.css";

import { useState } from "react";
import { CheckIcon, GoogleLogoIcon } from "@phosphor-icons/react/ssr";
import type { EventCategory } from "~/lib/eventKind";
import Callout, { type CalloutTone } from "~/ui/callout";
import { Chip } from "~/ui/chip";
import { CodeInput } from "~/ui/code-input";
import Field from "~/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { Button } from "~/ui/button";
import LinkButton from "~/ui/link-button";

export interface CheckInMeeting {
  id: string;
  title: string;
  /** "Mon, Oct 26 · 6–8 PM", already formatted on the server. */
  when: string;
  category: EventCategory;
  categoryLabel: string;
  ongoing: boolean;
}

/** `/auth` starts the Google handshake; it must not be prefetched. */
const SIGN_IN_HREF = "/auth?callbackPath=%2Fattendance";

export function MeetingLine({ meeting }: { meeting: CheckInMeeting }) {
  return (
    <div className="att-mtg">
      <Chip kind={meeting.category}>{meeting.categoryLabel}</Chip>
      <b>{meeting.title}</b>
      <span className="att-when">{meeting.when}</span>
    </div>
  );
}

/**
 * Step 1 of `checkin.html`: pick the meeting (only when more than one is open),
 * type the six-digit code, post to `/attendance/claim`. The claim route handles
 * a signed-out member by sending them through Google and back, so the form is
 * shown to everyone; `offerSignIn` only decides whether to offer signing in first.
 */
export default function CheckInForm({
  meetings,
  selectedId,
  offerSignIn,
  problem,
}: {
  meetings: CheckInMeeting[];
  selectedId: string;
  /** Show the "sign in first" line (signed out, or after a non-UGA account). */
  offerSignIn: boolean;
  /** A refusal from the last attempt, shown above the field. */
  problem?: { tone: CalloutTone; title: string; body: string; code?: boolean };
}) {
  const [code, setCode] = useState("");
  const [meetingId, setMeetingId] = useState(selectedId);
  const meeting = meetings.find((m) => m.id === meetingId) ?? meetings[0]!;

  return (
    <form
      action="/attendance/claim"
      method="post"
      className="att-form"
      data-testid="checkin-form"
    >
      {meetings.length > 1 ? (
        <Field
          label="Meeting"
          description="Only meetings that have started are listed."
        >
          <Select name="meeting" value={meetingId} onValueChange={setMeetingId}>
            <SelectTrigger data-testid="checkin-meeting" aria-label="Meeting">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meetings.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.ongoing ? "Now · " : ""}
                  {m.title} · {m.when}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <>
          <input type="hidden" name="meeting" value={meeting.id} />
          <MeetingLine meeting={meeting} />
        </>
      )}
      {meetings.length > 1 && <MeetingLine meeting={meeting} />}

      {problem && (
        <Callout tone={problem.tone} title={problem.title} alert>
          {problem.body}
        </Callout>
      )}

      <Field
        label="Six-digit code"
        description="Codes rotate every 30 seconds. Pasting works."
      >
        <div data-testid="checkin-code">
          <CodeInput
            name="code"
            aria-label="Six-digit meeting code"
            value={code}
            onChange={setCode}
            invalid={problem?.code}
          />
        </div>
      </Field>

      <Button
        type="submit"
        size="lg"
        disabled={code.length !== 6}
        data-testid="checkin-submit"
      >
        <CheckIcon weight="bold" aria-hidden />
        Check in
      </Button>

      {offerSignIn && (
        <p className="att-note">
          Not signed in yet? Type the code and we will ask you to sign in with
          your UGA Google account, then record your check-in. Or{" "}
          <LinkButton
            href={SIGN_IN_HREF}
            prefetch={false}
            variant="link"
            data-testid="checkin-signin"
          >
            <GoogleLogoIcon weight="bold" aria-hidden /> sign in first
          </LinkButton>
          .
        </p>
      )}
    </form>
  );
}

export { SIGN_IN_HREF };
