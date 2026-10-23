"use client";

import { useState, useTransition } from "react";
import FormButton from "~/components/FormButton";
import {
  describeHandleOutcome,
  handleKindLabel,
  handleUrlPath,
  revealsConnectedUsername,
  type HandleOutcomeMessage,
} from "~/lib/handleOptions";
import { getMyHandleChoices } from "~/server/actions/publicProfile";
import setHandle from "~/server/actions/profileHandle";
import type { HandleChoices } from "~/server/loaders/publicProfiles";
import Callout from "~/ui/callout";
import { profilePath } from "~/lib/profilePath";
import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";

interface Props {
  /** What the server read when the picker rendered. Later reads replace it. */
  choices: HandleChoices;
  /** Called with the stored handle after a successful save. */
  onSaved?: (handle: string) => void;
  /**
   * Deferred mode, for a page with one Save: the parent owns the selection and
   * does the write. The picker then shows no Save button and no result.
   */
  value?: string | null;
  onValueChange?: (handle: string) => void;
}

/**
 * Lets a member choose the handle their public profile lives at. Shared by
 * the verification dialog and the profile settings.
 *
 * Availability is a snapshot: another member can take an option after this
 * list was read. `setHandle` answers that race with `taken`, which this shows
 * inline and follows with a fresh read, so the member sees the real state
 * rather than clicking the same dead option again.
 */
export default function HandlePicker({
  choices: initial,
  onSaved,
  value,
  onValueChange,
}: Props) {
  const deferred = onValueChange !== undefined;
  const [ownChoices, setChoices] = useState(initial);
  const choices = deferred ? initial : ownChoices;
  const [ownSelected, setSelected] = useState<string | null>(initial.current);
  const selected = deferred ? (value ?? null) : ownSelected;
  const [result, setResult] = useState<HandleOutcomeMessage | null>(null);
  const [pending, startTransition] = useTransition();

  const unchanged = selected === null || selected === choices.current;
  const picked = choices.options.find((o) => o.handle === selected);

  function save() {
    if (selected === null) return;
    startTransition(async () => {
      let outcome: HandleOutcomeMessage;
      try {
        const response = await setHandle(selected);
        outcome = describeHandleOutcome(response);
        if (response.status === "set") {
          setChoices((current) => ({ ...current, current: response.handle }));
          onSaved?.(response.handle);
        }
      } catch {
        outcome = {
          tone: "critical",
          message: "Something went wrong saving your handle. Try again.",
          refresh: false,
        };
      }
      setResult(outcome);
      if (outcome.refresh) {
        try {
          const fresh = await getMyHandleChoices();
          setChoices(fresh);
          setSelected(fresh.current);
        } catch {
          // Keep the old list; the message above already says what happened.
        }
      }
    });
  }

  if (choices.options.length === 0) {
    return (
      <p className="help">
        There are no handles to choose from yet. Add a preferred name or link a
        GitHub or Discord account, then come back.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="help max-w-[62ch]">
        Your handle is public: anyone can see it in your profile address.
        Choosing your GitHub or Discord username makes that username public even
        if the account is hidden on your profile.
      </p>

      <fieldset className="set-hpick" disabled={pending}>
        <legend className="sr-only">Handle</legend>
        <div className="card flat" style={{ padding: 0 }}>
          {choices.options.map((option) => {
            const taken = !option.available;
            const isSelected = selected === option.handle;
            const isCurrent = option.handle === choices.current;
            return (
              <label
                key={option.handle}
                className={`set-hopt${isSelected ? "sel" : ""}${taken ? "taken" : ""}`}
              >
                <input
                  type="radio"
                  name="handle"
                  value={option.handle}
                  checked={isSelected}
                  disabled={taken}
                  onChange={() => {
                    if (deferred) onValueChange(option.handle);
                    else setSelected(option.handle);
                    setResult(null);
                  }}
                  className="sr-only"
                />
                <span
                  className={`check radio${isSelected ? "on" : ""}`}
                  aria-hidden
                >
                  <i />
                </span>
                <span className="min-w-0">
                  <b>
                    {handleKindLabel(option.kind)}
                    {isCurrent && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        Current
                      </span>
                    )}
                  </b>
                  <span className="p">{handleUrlPath(option)}</span>
                </span>
                {taken ? (
                  <span className="av no">
                    <XCircleIcon aria-hidden />
                    <span className="capitalize">taken</span>
                  </span>
                ) : (
                  !isCurrent && (
                    <span className="av ok">
                      <CheckCircleIcon aria-hidden />
                      Available
                    </span>
                  )
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {picked &&
        revealsConnectedUsername(picked.kind) &&
        picked.handle !== choices.current && (
          <Callout tone="info">
            This publishes your {handleKindLabel(picked.kind)} to everyone who
            sees your profile address.
          </Callout>
        )}

      {deferred &&
        picked &&
        choices.current &&
        picked.handle !== choices.current && (
          <Callout tone="warning" title="Your address will change">
            from {profilePath(choices.current)} to {profilePath(picked.handle)}.
            Old links stop working when you save.
          </Callout>
        )}

      {!deferred && (
        <div className="flex flex-wrap items-center gap-3">
          <FormButton
            type="button"
            theme="cyan"
            className="w-fit text-sm"
            disabled={unchanged || pending}
            onClick={save}
          >
            {pending ? "Saving…" : "Save handle"}
          </FormButton>
        </div>
      )}

      {result && (
        <Callout tone={result.tone} alert>
          {result.message}
        </Callout>
      )}
    </div>
  );
}
