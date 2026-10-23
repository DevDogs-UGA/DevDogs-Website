import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { Band } from "~/ui/band";
import { Card } from "~/ui/card";
import Badge from "~/ui/badge";
import { Tag } from "~/ui/tag";
import { TextLink } from "~/ui/text-link";
import Link from "next/link";
import { cn } from "~/lib/cn";
import { PROJECTS } from "~/config/projects";
import { PROJECT_ICONS } from "./project-icons";

const OPEN_PROJECTS = PROJECTS.filter((p) => p.contributions === "open");

/**
 * What the cards say about each project's state and stack, from `FACTS.md`.
 * `config/projects.ts` keeps its own badge wording ("Active") for the app
 * switcher, which answers "where can I go"; the homepage answers "what is it
 * like now", so these lines name the actual stage.
 */
const HOME_FACTS: Record<string, { status: string; tech: string[] }> = {
  DogDays: {
    status: "Public alpha",
    tech: ["Next.js", "TypeScript", "Tailwind CSS", "Supabase"],
  },
  DogPack: {
    status: "Pilot",
    tech: ["Flutter", "Dart", "Supabase"],
  },
};

/** The open projects as two cards on a band. */
export default function ProjectsSection() {
  return (
    <Band id="projects" className="section scroll-mt-20">
      <div className="wrap">
        <div className="home-shead">
          <div>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              Projects
            </div>
            <h2>Built by students, for students.</h2>
          </div>
          <TextLink asChild>
            <Link href="/github" prefetch={false}>
              All projects <ArrowRightIcon weight="bold" />
            </Link>
          </TextLink>
        </div>
        <div className="g2 grid" style={{ gap: 28 }}>
          {OPEN_PROJECTS.map((project) => {
            const facts = HOME_FACTS[project.title];
            const mark = project.icon ? PROJECT_ICONS[project.icon] : null;
            return (
              <Card key={project.title} className="quiet home-proj">
                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  {mark ? (
                    <span
                      className={cn(
                        "home-mark",
                        project.icon === "dogpack" && "dogpack",
                      )}
                      style={{ fontSize: 44, lineHeight: 0 }}
                    >
                      <mark.Icon />
                    </span>
                  ) : (
                    <span />
                  )}
                  <Badge variant="info">
                    {facts?.status ?? project.badge.label}
                  </Badge>
                </div>
                <h3 className="h2" style={{ margin: "18px 0 4px" }}>
                  {project.title}
                </h3>
                <div className="eyebrow">{project.tagline}</div>
                <p style={{ margin: "14px 0 20px" }}>{project.description}</p>
                <div className="row" style={{ gap: 6 }}>
                  {(facts?.tech ?? []).map((name) => (
                    <Tag key={name}>{name}</Tag>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </Band>
  );
}
