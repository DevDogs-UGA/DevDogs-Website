"use client";

import { ChatCircleDotsIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import "~/components/Content/content.css";
import DiscordMarkdown from "./DiscordMarkdown";
import { openSupport } from "./events";

/**
 * The body of a published FAQ post. Mentions were stripped when the post was
 * indexed, so the renderer never has a name to resolve; the empty maps are
 * the honest input, not a shortcut.
 */
export default function AnsweredQuestion({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="content-qa">
      <Card className="quiet" as="section" aria-labelledby="qa-question">
        <h2 id="qa-question" className="eyebrow content-qa-label">
          Question
        </h2>
        <div className="content-qa-body">
          <DiscordMarkdown content={question} users={{}} roles={{}} />
        </div>
      </Card>
      <Card
        className="quiet"
        kind="workshop"
        as="section"
        aria-labelledby="qa-answer"
      >
        <h2 id="qa-answer" className="eyebrow k content-qa-label">
          <SealCheckIcon weight="fill" aria-hidden />
          Answer from an officer
        </h2>
        <div className="content-qa-body">
          <DiscordMarkdown content={answer} users={{}} roles={{}} />
        </div>
      </Card>
      <div className="content-qa-more">
        <span>Still stuck?</span>
        <Button onClick={openSupport}>
          <ChatCircleDotsIcon aria-hidden /> Ask a question
        </Button>
      </div>
    </div>
  );
}
