"use client";

import { type RefObject } from "react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import { isValidLinkUrl, PROFILE_LIMITS } from "~/lib/validation/profile";

interface AddLinkInputProps {
  id?: string;
  urlValue: string;
  onUrlChange: (v: string) => void;
  titleValue: string;
  onTitleChange: (v: string) => void;
  /** Stages the typed link into the draft list. Local; nothing is written. */
  onSubmit: () => void;
  /** "Add" for a new link. */
  submitLabel: string;
  canSubmit: boolean;
  disabled: boolean;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  urlInputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * The add-a-link row: an address and, once the address is usable, an optional
 * title. Enter in either box stages the link.
 *
 * The disabled styling keys on `has-[input:disabled]:`, never a blanket
 * `has-disabled:`: the Add button is disabled until the address is valid, and
 * a blanket selector would let it switch off the box you type the address into
 * (AddLinkInput.test.tsx pins this).
 */
export default function AddLinkInput({
  id,
  urlValue,
  onUrlChange,
  titleValue,
  onTitleChange,
  onSubmit,
  submitLabel,
  canSubmit,
  disabled,
  titleInputRef,
  urlInputRef,
}: AddLinkInputProps) {
  const split = isValidLinkUrl(urlValue);

  return (
    <div
      role="group"
      aria-label="Add link"
      className="flex max-w-[720px] flex-wrap items-end gap-3 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60"
    >
      <div className="field min-w-[220px] flex-[1.5]">
        <label className="label" htmlFor={id}>
          New link address
        </label>
        <span className="input mono">
          <input
            ref={urlInputRef}
            id={id}
            type="url"
            value={urlValue}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && split && !disabled) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="https://example.com"
            disabled={disabled}
            aria-label="Link URL"
          />
        </span>
      </div>
      {split && (
        <div className="field min-w-[160px] flex-1">
          <label className="label" htmlFor={id ? `${id}-title` : undefined}>
            Title (optional)
          </label>
          <span className="input">
            <input
              ref={titleInputRef}
              id={id ? `${id}-title` : undefined}
              type="text"
              value={titleValue}
              onChange={(e) => onTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !disabled) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              // Matches `profileLinks.title`, which is varchar(64).
              maxLength={PROFILE_LIMITS.linkTitle}
              disabled={disabled}
              aria-label="Link title (optional)"
            />
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || disabled}
        className="btn secondary sm"
      >
        <PlusIcon aria-hidden />
        {submitLabel}
      </button>
    </div>
  );
}
