import { z } from "zod";
import { ANSWER_MAX_LENGTH, type Question } from "./questions.js";

/**
 * What an answer to each question type looks like, stored as JSON beside the
 * question's id. Choices are stored by option id, never by label, so a
 * relabelled option relabels every earlier answer with it; `describeAnswer`
 * turns one back into words for a person or an export.
 *
 * - text, longText: `{ "text": "…" }`
 * - choice: `{ "option": "discord" }`, or `{ "other": "…" }` when the
 *   question allows a free-text Other
 * - multiChoice: `{ "options": ["web", …], "other"?: "…" }`
 * - scale: `{ "value": 4 }`
 *
 * One schema per question, so the platform's survey action and anything that
 * reads answers back agree on what a valid answer to THAT question is: its
 * options, its length cap, its range. Retired options are refused for new
 * answers (`answerSchema`) but still described (`describeAnswer`), since old
 * answers keep them.
 */

export type Answer =
  | { text: string }
  | { option: string }
  | { other: string }
  | { options: string[]; other?: string }
  | { value: number };

const otherText = z.string().trim().min(1).max(ANSWER_MAX_LENGTH);

/** The schema a new answer to `question` must match. */
export function answerSchema(question: Question): z.ZodType<Answer> {
  switch (question.type) {
    case "text":
    case "longText":
      return z.strictObject({
        text: z
          .string()
          .trim()
          .min(1)
          .max(question.maxLength ?? ANSWER_MAX_LENGTH),
      });
    case "choice": {
      const offered = question.options
        .filter((o) => !o.retired)
        .map((o) => o.id);
      const option = z.strictObject({
        option: z.string().refine((id) => offered.includes(id), "not a choice"),
      });
      return question.other
        ? z.union([option, z.strictObject({ other: otherText })])
        : option;
    }
    case "multiChoice": {
      const offered = question.options
        .filter((o) => !o.retired)
        .map((o) => o.id);
      return z
        .strictObject({
          options: z
            .array(
              z.string().refine((id) => offered.includes(id), "not a choice"),
            )
            .refine((ids) => new Set(ids).size === ids.length, "chosen twice"),
          other: question.other ? otherText.optional() : z.undefined(),
        })
        .refine((a) => {
          const count = a.options.length + (a.other ? 1 : 0);
          return (
            count >= Math.max(question.minSelected ?? 0, 1) &&
            count <= (question.maxSelected ?? Infinity)
          );
        }, "wrong number of choices");
    }
    case "scale":
      return z.strictObject({
        value: z.int().min(question.min).max(question.max),
      });
  }
}

/** An answer in words: option labels, Other's text, `;`-joined for several. */
export function describeAnswer(question: Question, answer: Answer): string {
  const label = (id: string) =>
    "options" in question
      ? (question.options.find((o) => o.id === id)?.label ?? id)
      : id;
  if ("text" in answer) return answer.text;
  if ("value" in answer) return String(answer.value);
  if ("option" in answer) return label(answer.option);
  if ("options" in answer) {
    return [
      ...answer.options.map(label),
      ...(answer.other ? [answer.other] : []),
    ].join("; ");
  }
  return answer.other;
}
