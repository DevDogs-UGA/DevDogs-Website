"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import ProgressBar from "~/ui/progress-bar";
import { stepKey, useDoneSteps } from "./store";

/** A course as the hub knows it: its steps, project-relative, in reading order. */
export interface HubCourse {
  project: string;
  name: string;
  href: string;
  steps: { path: string; title: string; href: string }[];
}

/**
 * The right-hand column of a course's row on the hub: how far the reader is
 * (kept in this browser only, see ./store). "Not started" until hydration, as
 * the server cannot know better.
 */
export function CourseStatus({ course }: { course: HubCourse }) {
  const done = useDoneSteps();
  const finished = course.steps.filter((s) =>
    done.has(stepKey(course.project, s.path)),
  ).length;

  if (finished === 0) return <span>Not started</span>;
  return (
    <>
      <b>
        {finished} of {course.steps.length} done
      </b>
      <ProgressBar
        value={finished}
        max={course.steps.length}
        kind="workshop"
        label={`${course.name} progress`}
      />
    </>
  );
}

/**
 * "Continue where you left off": the first course the reader has started and
 * not finished, with its next step. Renders nothing for a first-time reader,
 * so the cached hub never promises progress it cannot know.
 */
export function ContinueStrip({ courses }: { courses: HubCourse[] }) {
  const done = useDoneSteps();
  for (const course of courses) {
    const finished = course.steps.filter((s) =>
      done.has(stepKey(course.project, s.path)),
    ).length;
    if (finished === 0 || finished === course.steps.length) continue;
    const nextIndex = course.steps.findIndex(
      (s) => !done.has(stepKey(course.project, s.path)),
    );
    const next = course.steps[nextIndex]!;
    return (
      <section className="card docs-cont" aria-labelledby="docs-cont-h">
        <div>
          <div className="eyebrow">Continue where you left off</div>
          <h2 id="docs-cont-h">
            {course.name} · {next.title}
          </h2>
          <p className="docs-cont-meta">
            <b>
              {finished} of {course.steps.length} done
            </b>{" "}
            · step {nextIndex + 1} is next
          </p>
          <ProgressBar
            value={finished}
            max={course.steps.length}
            kind="workshop"
            label={`${course.name} progress`}
          />
        </div>
        <Button asChild size="lg">
          <Link href={next.href}>
            Continue
            <ArrowRightIcon weight="bold" />
          </Link>
        </Button>
      </section>
    );
  }
  return null;
}
