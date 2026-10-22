"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CaretRightIcon } from "@phosphor-icons/react/ssr";
import {
  Command,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";
import { Kbd } from "~/ui/kbd";
import { highlightMatches } from "~/server/search/match";
import { SUPPORT_ACTION_URL, type SearchEntry } from "~/server/search/types";
import { openSupport } from "./SupportWidget/events";
import * as icons from "~/config/icons";
import { useSiteSearch } from "../hooks/useSiteSearch";

function SearchResultItem({
  entry,
  query,
  onSelect,
}: {
  entry: SearchEntry;
  query: string;
  onSelect: () => void;
}) {
  const Icon = icons[entry.icon];

  return (
    <CommandItem
      value={entry.id}
      onSelect={onSelect}
      icon={Icon ? <Icon weight="bold" /> : undefined}
    >
      <div className="cmd-tx">
        {entry.breadcrumbs.length > 0 && (
          <div className="cmd-sub inline-flex items-center gap-0.5">
            {entry.breadcrumbs.map((b, i) => (
              <Fragment key={i}>
                {i > 0 && <CaretRightIcon weight="bold" className="size-3" />}
                <span>{b}</span>
              </Fragment>
            ))}
          </div>
        )}
        <div
          className="cmd-title"
          dangerouslySetInnerHTML={{
            __html: highlightMatches(entry.title, query),
          }}
        />
        {entry.snippet ? (
          <div
            className="cmd-sub clamp"
            // Server-built: HTML-escaped before sentinel → <mark> replacement.
            dangerouslySetInnerHTML={{ __html: entry.snippet }}
          />
        ) : (
          entry.description && (
            <div
              className="cmd-sub"
              dangerouslySetInnerHTML={{
                __html: highlightMatches(entry.description, query),
              }}
            />
          )
        )}
      </div>
      <Kbd className="cmd-go" aria-hidden>
        <ArrowRightIcon weight="bold" /> Open
      </Kbd>
    </CommandItem>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DevDogsSearchDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const { search, setSearch, data, isLoading } = useSiteSearch();
  const results = data !== "empty" ? data : [];
  const hasResults = results.length > 0;
  const pageResults = results.filter((entry) => entry.group === "pages");
  const docsResults = results.filter((entry) => entry.group === "docs");
  const forumResults = results.filter((entry) => entry.group === "forum");

  function handleSelect(url: string) {
    onOpenChange(false);
    if (url === SUPPORT_ACTION_URL) openSupport();
    else router.push(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search</DialogTitle>
        <DialogDescription>Search pages, docs, and settings</DialogDescription>
      </DialogHeader>
      <DialogContent
        className="cmd-dialog top-[72px] translate-y-0 gap-0 overflow-visible"
        showCloseButton={false}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search pages, docs, and settings..."
            value={search}
            onValueChange={setSearch}
          />
          <div aria-hidden className="cmd-progress">
            {isLoading && <i className="animate-search-progress" />}
          </div>
          <CommandList>
            {!search.trim() && (
              <div className="cmd-empty">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src="/cosmic/a/mascot-peek.png" />
                <b>Search DevDogs</b>
                <span>Start typing to find pages, docs, and settings.</span>
              </div>
            )}
            {!isLoading && search.trim() && !hasResults && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}
            {pageResults.length > 0 && (
              <CommandGroup heading="Pages" count={pageResults.length}>
                {pageResults.map((entry) => (
                  <SearchResultItem
                    key={entry.id}
                    entry={entry}
                    query={search}
                    onSelect={() => handleSelect(entry.url)}
                  />
                ))}
              </CommandGroup>
            )}
            {docsResults.length > 0 && (
              <CommandGroup heading="Docs" count={docsResults.length}>
                {docsResults.map((entry) => (
                  <SearchResultItem
                    key={entry.id}
                    entry={entry}
                    query={search}
                    onSelect={() => handleSelect(entry.url)}
                  />
                ))}
              </CommandGroup>
            )}
            {forumResults.length > 0 && (
              <CommandGroup
                heading="Answered questions"
                count={forumResults.length}
              >
                {forumResults.map((entry) => (
                  <SearchResultItem
                    key={entry.id}
                    entry={entry}
                    query={search}
                    onSelect={() => handleSelect(entry.url)}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <CommandFooter>
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> to move
            </span>
            <span>
              <Kbd>↵</Kbd> to open
            </span>
            <span className="end">
              <Kbd>Esc</Kbd> to close
            </span>
          </CommandFooter>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
