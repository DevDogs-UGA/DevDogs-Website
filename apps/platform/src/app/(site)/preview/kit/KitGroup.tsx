import KitMarkup from "./KitMarkup";
import { KIT_GROUPS } from "./groups";

const FINISHES = [
  { finish: "cosmic", label: "Cosmic · DevDogs" },
  { finish: "paper", label: "Paper · GDG on Campus" },
] as const;

/**
 * One group of the mockup's components page as static markup in both finishes.
 * The stub sections render these; a unit replaces a stub's `<KitGroup>` with
 * its live primitives (wrapped in the same `<section className="grp">` /
 * `.pair` / `.pane` shell, which the page's gallery CSS styles).
 */
export default function KitGroup({ title }: { title: string }) {
  const group = KIT_GROUPS.find((g) => g.title === title);
  if (!group) throw new Error(`No kit group titled "${title}"`);
  return (
    <section className="grp" id={title.toLowerCase().replace(/\W+/g, "-")}>
      <h2>{group.title}</h2>
      <p dangerouslySetInnerHTML={{ __html: group.note }} />
      <div className="pair">
        {FINISHES.map(({ finish, label }) => (
          <KitMarkup
            key={finish}
            finish={finish}
            label={label}
            html={group.html}
          />
        ))}
      </div>
    </section>
  );
}
