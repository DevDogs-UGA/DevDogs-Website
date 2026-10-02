import { z } from "zod";

/**
 * The shape of `data/questions.json`: every question the check-in survey can
 * ask, authored as versioned data like the meetings that ask them.
 *
 * A question's `scope` says what its answer belongs to:
 *
 * - `member`: one answer per person, carried from meeting to meeting. Asked
 *   at every check-in until answered, then kept, editable, under the
 *   survey's saved answers. Never listed on a meeting.
 * - `meeting`: one answer per person per meeting, asked only at the meetings
 *   whose `questions` list it, every time. `prefill: "last"` starts the form
 *   from the person's answer at their previous meeting.
 *
 * Ids (a question's and each option's) are permanent once anyone has
 * answered: answers point at them. Wording can change freely; a question or
 * option that should stop being offered is `retired`, never deleted, and a
 * question whose `type` must change is a new question.
 *
 * Structural only, like `schema.ts`; cross-references (a meeting naming a
 * question that does not exist, or a member question) are `validator.ts`'s.
 */

/** Lowercase snake_case, so an id reads well as an export column. */
export const QUESTION_ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** A Bevy attendee import column for the answer, e.g.
 * `survey:level_of_developer_experience_1`. */
export const BEVY_COLUMN_PATTERN = /^survey:[a-z0-9_]+$/;

export const QUESTION_PROMPT_MAX_LENGTH = 200;
export const QUESTION_HELP_MAX_LENGTH = 280;
export const OPTION_LABEL_MAX_LENGTH = 80;
/** The longest answer any text question may allow. */
export const ANSWER_MAX_LENGTH = 4000;

const questionId = z
  .string()
  .regex(QUESTION_ID_PATTERN, "must be lowercase snake_case")
  .meta({
    description:
      "Permanent id, lowercase snake_case (developer_experience). Answers point at it.",
  });

const optionSchema = z.strictObject({
  id: z
    .string()
    .regex(QUESTION_ID_PATTERN, "must be lowercase snake_case")
    .meta({
      description: "Permanent id within the question. Answers store it.",
    }),
  label: z.string().min(1).max(OPTION_LABEL_MAX_LENGTH),
  retired: z
    .boolean()
    .optional()
    .meta({ description: "Stop offering it; earlier answers keep it." }),
});

export type QuestionOption = z.infer<typeof optionSchema>;

/** Fields every question has, whatever its type. */
const common = {
  id: questionId,
  scope: z.enum(["member", "meeting"]).meta({
    description:
      "member: one answer per person, asked until answered, then editable. meeting: asked at each meeting that lists it.",
  }),
  prompt: z
    .string()
    .min(1)
    .max(QUESTION_PROMPT_MAX_LENGTH)
    .meta({ description: "The question as shown." }),
  help: z
    .string()
    .max(QUESTION_HELP_MAX_LENGTH)
    .optional()
    .meta({ description: "A smaller line under the prompt." }),
  required: z.boolean().optional().meta({
    description:
      "Needed to submit the survey (never to check in). Default false.",
  }),
  retired: z.boolean().optional().meta({
    description: "Stop asking it, even where listed; answers are kept.",
  }),
  prefill: z.enum(["last", "none"]).optional().meta({
    description:
      "Meeting questions only. last: start from the person's previous answer. Default none.",
  }),
  bevy: z
    .string()
    .regex(BEVY_COLUMN_PATTERN, "must be a Bevy survey: column")
    .optional()
    .meta({
      description:
        "The Bevy attendee import column this answer fills (survey:…).",
    }),
};

const choices = {
  options: z
    .array(optionSchema)
    .min(2)
    .meta({ description: "The choices, in order." }),
  other: z
    .boolean()
    .optional()
    .meta({ description: 'Add a free-text "Other". Default false.' }),
};

const textQuestion = z.strictObject({
  ...common,
  type: z.literal("text").meta({ description: "One line of text." }),
  maxLength: z.int().min(1).max(ANSWER_MAX_LENGTH).optional(),
});

const longTextQuestion = z.strictObject({
  ...common,
  type: z.literal("longText").meta({ description: "A paragraph." }),
  maxLength: z.int().min(1).max(ANSWER_MAX_LENGTH).optional(),
});

const choiceQuestion = z.strictObject({
  ...common,
  type: z.literal("choice").meta({ description: "Pick one." }),
  ...choices,
});

const multiChoiceQuestion = z
  .strictObject({
    ...common,
    type: z.literal("multiChoice").meta({ description: "Pick any number." }),
    ...choices,
    minSelected: z.int().min(0).optional(),
    maxSelected: z.int().min(1).optional(),
  })
  .refine(
    (q) =>
      q.minSelected === undefined ||
      q.maxSelected === undefined ||
      q.minSelected <= q.maxSelected,
    {
      message: "minSelected must not exceed maxSelected",
      path: ["minSelected"],
    },
  );

const scaleQuestion = z.strictObject({
  ...common,
  type: z.literal("scale").meta({ description: "A number on a range." }),
  min: z.int().min(0).max(1),
  max: z.int().min(2).max(10),
  minLabel: z.string().max(OPTION_LABEL_MAX_LENGTH).optional(),
  maxLabel: z.string().max(OPTION_LABEL_MAX_LENGTH).optional(),
});

export const questionSchema = z.discriminatedUnion("type", [
  textQuestion,
  longTextQuestion,
  choiceQuestion,
  multiChoiceQuestion,
  scaleQuestion,
]);

export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question["type"];

export const questionsConfigSchema = z.strictObject({
  /** The editor's pointer to `questions.schema.json`; ignored otherwise. */
  $schema: z.string().optional(),
  questions: z.array(questionSchema),
});

export type QuestionsConfig = z.infer<typeof questionsConfigSchema>;
