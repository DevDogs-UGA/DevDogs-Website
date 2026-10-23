"use client";

import { useActionState } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import {
  updateReflectionSettings,
  type ReflectionSettingsActionState,
} from "~/server/actions/reflectionSettings";
import type { ReflectionSettingsValue } from "~/server/reflections/settings";
import { Panel } from "~/ui/app-shell";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { InputGroup, InputGroupInput, InputGroupText } from "~/ui/input-group";

const initialState: ReflectionSettingsActionState = { ok: false, message: "" };

/**
 * Officer-only editor for the two knobs `reflectionSettings` exposes: how
 * many words an EL reflection needs to submit, and how many days after the
 * activity ends the submission window stays open. Both are read fresh from
 * the DB by `/attendance` on every load (see `reflections/load.ts`), so this
 * form has no client cache of its own to invalidate beyond the
 * `revalidatePath` calls `updateReflectionSettings` already makes.
 *
 * Lives on `/console/reflections`; it used to sit on the meetings page.
 */
export default function ReflectionSettingsCard({
  settings,
}: {
  settings: ReflectionSettingsValue;
}) {
  const [state, action, pending] = useActionState(
    updateReflectionSettings,
    initialState,
  );

  return (
    <form action={action}>
      <Panel
        id="reflection-settings"
        title="Reflection settings"
        help="How many words a submission needs, and how many days after a meeting ends members may still submit one. Applies to new submissions; reflections already in progress keep the rules they started with."
      >
        <div className="con-fields">
          <Field
            label="Minimum words"
            htmlFor="minimumWordCount"
            description="1 to 1000."
          >
            <InputGroup>
              <InputGroupInput
                id="minimumWordCount"
                name="minimumWordCount"
                type="number"
                defaultValue={settings.minimumWordCount}
                min={1}
                max={1000}
                step={1}
                required
              />
              <InputGroupText className="unit">words</InputGroupText>
            </InputGroup>
          </Field>
          <Field
            label="Submission window"
            htmlFor="submissionWindowDays"
            description="1 to 90. Counted from the end of the meeting."
          >
            <InputGroup>
              <InputGroupInput
                id="submissionWindowDays"
                name="submissionWindowDays"
                type="number"
                defaultValue={settings.submissionWindowDays}
                min={1}
                max={90}
                step={1}
                required
              />
              <InputGroupText className="unit">days</InputGroupText>
            </InputGroup>
          </Field>
        </div>
        <div className="con-meta" style={{ marginTop: 28 }}>
          <Button type="submit" loading={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          {state.message && (
            <p
              role="status"
              className="con-meta"
              style={{
                color: state.ok ? "var(--ok)" : "var(--bad)",
                margin: 0,
              }}
            >
              {state.ok ? (
                <CheckCircleIcon weight="bold" aria-hidden />
              ) : (
                <WarningCircleIcon weight="bold" aria-hidden />
              )}
              {state.message}
            </p>
          )}
        </div>
      </Panel>
    </form>
  );
}
