import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Scene, { type SceneName } from "~/components/Scene";
import { kitGalleryEnabled } from "~/server/features";
import Glow from "./Glow";
import { KIT_SECTIONS } from "./registry";

export const metadata: Metadata = {
  title: "Kit gallery | DevDogs",
  robots: { index: false, follow: false },
};

/** Development only and never cached: staging and production answer 404. */
export const dynamic = "force-dynamic";

const SCENES: SceneName[] = [
  "head-brand",
  "head-build",
  "head-workshop",
  "head-social",
  "head-milestone",
  "head-info",
  "head-study",
];

export default function KitGalleryPage() {
  if (!kitGalleryEnabled()) notFound();

  return (
    <div className="kit-gallery">
      <style>{GALLERY_CSS}</style>
      <Glow />
      <div className="sheet">
        <header>
          <div className="eyebrow" style={{ color: "#ffa1ad" }}>
            Draft 26 · kit gallery
          </div>
          <h1>Component library</h1>
          <p>
            Every kit class from the mockup’s components page, as static markup
            styled by <code>cosmic.css</code>, in both finishes, followed by{" "}
            <code>&lt;Scene&gt;</code> and the cursor glow. Screenshot a
            primitive against <code>site-v26-final/png/components.png</code>.
          </p>
        </header>

        {KIT_SECTIONS.map(({ id, Section }) => (
          <Section key={id} />
        ))}

        <section className="grp">
          <h2>Scene</h2>
          <p>
            <code>&lt;Scene name&gt;</code> inside a <code>.pagehead</code>: the
            still is the section’s own background, the stage animates over it.
            Under reduced motion the planet holds frame 0 and the shooting star
            stays hidden; the twinkle keeps running.
          </p>
          <div className="cosmic scenes">
            {SCENES.map((name) => (
              <section
                key={name}
                className="pagehead"
                style={
                  {
                    "--head": `url(/cosmic/img/${name}.png)`,
                  } as React.CSSProperties
                }
              >
                <Scene name={name} />
                <div className="wrap">
                  <div className="eyebrow k">{name}</div>
                  <h1>Page header</h1>
                </div>
              </section>
            ))}
            <section
              className="pagehead"
              style={
                {
                  "--head": "url(/cosmic/img/hero-home.png)",
                  minHeight: 420,
                } as React.CSSProperties
              }
            >
              <Scene name="hero-home" />
              <div className="wrap">
                <div className="eyebrow k">hero-home</div>
                <h1>Hero scene</h1>
              </div>
            </section>
          </div>
        </section>

        <section className="grp">
          <h2>Cursor glow</h2>
          <p>
            Cards that link somewhere (<code>a.card</code>,{" "}
            <code>button.card</code>, <code>.card[tabindex]</code>) light up as
            a mouse pointer comes within 240px. Touch and pen do nothing.
          </p>
          <div className="cosmic glows">
            <div className="g3 grid" style={{ gap: 22 }}>
              <a className="card" href="#glow" data-kind="build">
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  Link card
                </div>
                <h3 className="card-title">a.card</h3>
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  Hover or approach.
                </p>
              </a>
              <div className="card k" tabIndex={0} data-kind="workshop">
                <div className="eyebrow k" style={{ marginBottom: 8 }}>
                  Category
                </div>
                <h3 className="card-title">.card[tabindex]</h3>
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  Outline and shadow in the kind.
                </p>
              </div>
              <div className="card">
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  Not interactive
                </div>
                <h3 className="card-title">.card</h3>
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  No glow.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** The mockup page’s own layout CSS, scoped to the gallery. */
const GALLERY_CSS = `
.kit-gallery { background:#000; color:#d7d0d7; font:15px/1.5 var(--font-ui, sans-serif); }
.kit-gallery x-icon { display:inline-flex; width:1em; height:1em; flex:none; vertical-align:-.125em; }
.kit-gallery x-icon svg { width:100%; height:100%; fill:currentColor; }
.kit-gallery .sheet { max-width:1440px; margin:0 auto; padding:40px 32px 80px; }
.kit-gallery .sheet > header { padding:8px 4px 28px; }
.kit-gallery .sheet > header h1 { font:800 44px/1 var(--font-display), sans-serif; color:#fff; margin:0 0 10px; text-shadow:5px 5px 0 #ec003f; }
.kit-gallery .sheet > header p { margin:0; max-width:80ch; color:#a89ea9; }
.kit-gallery .grp { margin-top:34px; }
.kit-gallery .grp > h2 { font:800 22px/1 var(--font-display), sans-serif; color:#fff; margin:0 0 6px; text-shadow:none; }
.kit-gallery .grp > p { margin:0 0 14px; color:#a89ea9; max-width:90ch; font-size:14px; }
.kit-gallery .pair { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; }
.kit-gallery .pane { padding:28px; border-radius:14px; min-width:0; position:relative; }
.kit-gallery .pane::before { content:attr(data-label); position:absolute; top:10px; right:14px; font:700 10.5px/1 var(--font-ui); letter-spacing:.14em; text-transform:uppercase; opacity:.55; }
.kit-gallery .paper.pane { background:#f8f9fa; }
.kit-gallery .spec { display:flex; flex-wrap:wrap; gap:16px; align-items:center; }
.kit-gallery .spec + .spec { margin-top:18px; }
.kit-gallery .col { display:flex; flex-direction:column; gap:14px; }
.kit-gallery .sw { display:grid; grid-template-columns:repeat(6,1fr); gap:10px; }
.kit-gallery .sw div { font:600 11.5px/1.3 var(--font-ui); color:var(--text-3); }
.kit-gallery .sw i { display:block; height:44px; margin-bottom:6px; }
.kit-gallery .paper .sw i { border-radius:10px; border:1.5px solid #1e1e1e; }
.kit-gallery .scenes { display:grid; gap:14px; }
@media (max-width:900px) {
  .kit-gallery .sheet { padding:24px 16px 56px; }
  .kit-gallery .pair { grid-template-columns:minmax(0,1fr); }
  .kit-gallery .pane { padding:20px 16px; overflow-x:auto; }
  .kit-gallery .sw { grid-template-columns:repeat(3,1fr); }
  .kit-gallery .sheet > header h1 { font-size:32px; }
}
`;
