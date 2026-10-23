"use client";

import { useState } from "react";
import {
  updateReflectionSettings,
  type ReflectionSettingsActionState,
} from "~/server/actions/reflectionSettings";
import type { ReflectionSettingsValue } from "~/server/reflections/settings";
import { Panel } from "~/ui/app-shell";
import Field from "~/ui/field";
import { InputGroup, InputGroupInput, InputGroupText } from "~/ui/input-group";
import { SettingsFormProvider, useSettingsField } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";

const noState: ReflectionSettingsActionState = { ok: false, message: "" };

/** Whole numbers inside the action's own bounds, or the sentence that says so. */
function check(value: string, min: number, max: number, name: string) {
  const n = Number(value);
  return value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max
    ? null
    : `${name} must be a whole number from ${min} to ${max}.`;
}

/**
 * Officer-only editor for the two knobs `reflectionSettings` exposes: how
 * many words an EL reflection needs to submit, and how many days after the
 * activity ends the submission window stays open. Both are read fresh from
 * the DB by `/attendance` on every load (see `reflections/load.ts`).
 *
 * Same save model as Settings: nothing is written until the bar under the
 * window says Save, and Discard returns both fields to the saved values.
 * Lives on `/console/reflections`; it used to sit on the meetings page.
 */
export default function ReflectionSettingsCard({
  settings,
}: {
  settings: ReflectionSettingsValue;
}) {
  return (
    <SettingsFormProvider>
      <ReflectionFields settings={settings} />
      <SettingsSaveBar />
    </SettingsFormProvider>
  );
}

function ReflectionFields({ settings }: { settings: ReflectionSettingsValue }) {
  const [saved, setSaved] = useState({
    words: String(settings.minimumWordCount),
    days: String(settings.submissionWindowDays),
  });
  const [words, setWords] = useState(saved.words);
  const [days, setDays] = useState(saved.days);

  const wordsError = check(words, 1, 1000, "Minimum words");
  const daysError = check(days, 1, 90, "Submission window");

  useSettingsField({
    id: "reflectionSettings",
    label: "Reflection settings",
    isDirty: words !== saved.words || days !== saved.days,
    error: wordsError ?? daysError,
    reset: () => {
      setWords(saved.words);
      setDays(saved.days);
    },
    save: () => persist(words, days),
  });

  async function persist(nextWords: string, nextDays: string) {
    if (nextWords === saved.words && nextDays === saved.days) return;
    const data = new FormData();
    data.set("minimumWordCount", nextWords);
    data.set("submissionWindowDays", nextDays);
    const outcome = await updateReflectionSettings(noState, data);
    if (!outcome.ok) throw new Error(outcome.message);
    setSaved({ words: nextWords, days: nextDays });
  }

  return (
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
              value={words}
              onChange={(e) => setWords(e.target.value)}
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
              value={days}
              onChange={(e) => setDays(e.target.value)}
              min={1}
              max={90}
              step={1}
              required
            />
            <InputGroupText className="unit">days</InputGroupText>
          </InputGroup>
        </Field>
      </div>
    </Panel>
  );
}
