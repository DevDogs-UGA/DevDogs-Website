"use client";

import "./support.css";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  BookOpenIcon,
  CaretRightIcon,
  ChatsCircleIcon,
  SealCheckIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/ui/dialog";
import { cn } from "~/lib/cn";
import type {
  SupportDocSuggestion,
  SupportQuestionSuggestion,
  SupportSuggestions,
} from "~/lib/support/types";
import DiscordMarkdown from "./DiscordMarkdown";

type Tab = "questions" | "docs";

/**
 * What the compose view shows in place of a suggestion list: one line
 * counting what was found, which opens the dialog. The panel is too narrow
 * to preview anything in, and a list there pushed the form around as the
 * visitor typed.
 */
export function SuggestionsSummary({
  suggestions,
  onOpen,
}: {
  suggestions: SupportSuggestions;
  onOpen: (tab: Tab) => void;
}) {
  const { questions, docs } = suggestions;
  const parts = [
    questions.length > 0 &&
      `${questions.length} similar question${questions.length === 1 ? "" : "s"}`,
    docs.length > 0 &&
      `${docs.length} docs page${docs.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={() => onOpen(questions.length > 0 ? "questions" : "docs")}
      className="docs-support-row flex w-full items-center gap-2.5 px-3 py-2 text-left"
    >
      <ChatsCircleIcon
        className="size-5 shrink-0 text-[var(--k3)]"
        weight="fill"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          This might already be answered
        </span>
        <span className="text-muted-foreground block text-xs">
          {parts.join(" · ")}
        </span>
      </span>
      <CaretRightIcon className="size-4 shrink-0 text-[var(--k3)]" />
    </button>
  );
}

/**
 * Similar questions and docs pages, on two tabs, with enough of each to
 * tell whether it is the answer without leaving the page: a question's
 * text, an FAQ's answer, a docs page's description and matching passage.
 * The server cuts question and answer text short, so each shows whole.
 */
export function SuggestionsDialog({
  suggestions,
  tab,
  onTabChange,
  onClose,
  onFollow,
  following,
  followBlocked,
}: {
  suggestions: SupportSuggestions;
  /** Null while closed. */
  tab: Tab | null;
  onTabChange: (tab: Tab) => void;
  onClose: () => void;
  onFollow: (threadId: string) => void;
  following: string | null;
  /** Why following is unavailable right now (the guest check), if it is. */
  followBlocked: string | null;
}) {
  const { questions, docs } = suggestions;
  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="docs-support-sub flex flex-col gap-1 px-5 pt-4 pb-3">
          <DialogTitle className="text-base font-semibold">
            Before you post
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            These matched what you&apos;ve written so far. Your draft is kept.
          </DialogDescription>
          <div role="tablist" className="mt-2 flex gap-1">
            <TabButton
              selected={tab === "questions"}
              onSelect={() => onTabChange("questions")}
              count={questions.length}
            >
              Similar questions
            </TabButton>
            <TabButton
              selected={tab === "docs"}
              onSelect={() => onTabChange("docs")}
              count={docs.length}
            >
              Docs pages
            </TabButton>
          </div>
        </div>
        <div
          role="tabpanel"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4"
        >
          {tab === "questions" &&
            (questions.length === 0 ? (
              <Empty>No similar questions in the forum yet.</Empty>
            ) : (
              questions.map((question) => (
                <QuestionCard
                  key={question.threadId}
                  question={question}
                  onFollow={onFollow}
                  following={following}
                  followBlocked={followBlocked}
                  onNavigate={onClose}
                />
              ))
            ))}
          {tab === "docs" &&
            (docs.length === 0 ? (
              <Empty>No docs pages matched.</Empty>
            ) : (
              docs.map((doc) => (
                <DocCard key={doc.url} doc={doc} onNavigate={onClose} />
              ))
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  selected,
  onSelect,
  count,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  count: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium",
        selected
          ? "bg-[var(--surface-2)] text-white shadow-[inset_0_-3px_0_var(--k3)]"
          : "text-muted-foreground hover:bg-[var(--surface-2)] hover:text-white",
      )}
    >
      {children}
      <span
        className={cn(
          "rounded px-1.5 text-xs",
          selected ? "bg-[var(--bg)]" : "bg-[var(--surface-2)]",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground py-8 text-center text-sm">{children}</p>
  );
}

function QuestionCard({
  question,
  onFollow,
  following,
  followBlocked,
  onNavigate,
}: {
  question: SupportQuestionSuggestion;
  onFollow: (threadId: string) => void;
  following: string | null;
  followBlocked: string | null;
  onNavigate: () => void;
}) {
  const status = question.hasAnswer
    ? {
        label: "Answered",
        className:
          "bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] text-[var(--ok)]",
      }
    : question.status === "resolved"
      ? {
          label: "Resolved",
          className: "bg-[var(--raised)] text-[var(--text-2)]",
        }
      : {
          label: "Open",
          className:
            "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]",
        };
  const canFollow = question.status === "open";

  return (
    <article className="docs-support-card flex flex-col gap-2.5 p-3.5">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase",
              status.className,
            )}
          >
            {status.label}
          </span>
          {question.tags.map((tag) => (
            <span
              key={tag}
              className="docs-support-chip px-1.5 py-0.5 text-[0.65rem] text-[var(--text-2)]"
            >
              {tag}
            </span>
          ))}
        </div>
        <h3 className="font-semibold">{question.title}</h3>
      </header>

      {question.question && (
        <div className="text-sm text-[var(--text-2)]">
          <DiscordMarkdown content={question.question} users={{}} roles={{}} />
        </div>
      )}

      {question.answer ? (
        <section className="flex flex-col gap-1.5 bg-[color-mix(in_srgb,var(--ok)_8%,transparent)] p-3 shadow-[inset_3px_0_0_var(--ok)]">
          <h4 className="flex items-center gap-1 text-xs font-semibold text-[var(--ok)] uppercase">
            <SealCheckIcon className="size-4" weight="fill" />
            Answer from an officer
          </h4>
          <div className="text-sm">
            <DiscordMarkdown content={question.answer} users={{}} roles={{}} />
          </div>
        </section>
      ) : (
        question.hasAnswer && (
          <p
            className="text-muted-foreground border-l-2 border-[var(--ok)] pl-2.5 text-xs [&_mark]:bg-transparent [&_mark]:font-semibold [&_mark]:text-current"
            // Server-built: HTML-escaped before the <mark> swap.
            dangerouslySetInnerHTML={{ __html: question.snippet }}
          />
        )
      )}

      {(question.isFaq || canFollow) && (
        <div className="flex flex-wrap items-center gap-2">
          {question.isFaq && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/help/${question.threadId}`} onClick={onNavigate}>
                Read the full answer
              </Link>
            </Button>
          )}
          {canFollow && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={following !== null || followBlocked !== null}
                onClick={() => onFollow(question.threadId)}
              >
                {following === question.threadId
                  ? "Following…"
                  : "Same question? Follow it"}
              </Button>
              {followBlocked && (
                <span className="text-muted-foreground text-xs">
                  {followBlocked}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

function DocCard({
  doc,
  onNavigate,
}: {
  doc: SupportDocSuggestion;
  onNavigate: () => void;
}) {
  return (
    <article className="docs-support-card flex flex-col gap-1.5 p-3.5">
      {doc.breadcrumbs.length > 0 && (
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <BookOpenIcon className="size-3.5 shrink-0" />
          {doc.breadcrumbs.join(" › ")}
        </p>
      )}
      <h3 className="font-semibold">{doc.title}</h3>
      {doc.description && (
        <p className="text-sm text-[var(--text-2)]">{doc.description}</p>
      )}
      {doc.snippet && (
        <p
          className="text-muted-foreground line-clamp-4 border-l-2 border-[var(--line-strong)] pl-2.5 text-xs [&_mark]:rounded-sm [&_mark]:bg-[color-mix(in_srgb,var(--k3)_25%,transparent)] [&_mark]:px-0.5 [&_mark]:text-current"
          // Server-built: HTML-escaped before the <mark> swap.
          dangerouslySetInnerHTML={{ __html: doc.snippet }}
        />
      )}
      <div className="pt-1">
        <Button size="sm" variant="outline" asChild>
          <Link href={doc.url} onClick={onNavigate}>
            Open the page
          </Link>
        </Button>
      </div>
    </article>
  );
}
