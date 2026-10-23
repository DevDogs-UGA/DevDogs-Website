import { Fragment } from "react";
import { ArrowRightIcon, CalendarDotsIcon } from "@phosphor-icons/react/ssr";
import Scene from "~/components/Scene";
import LinkButton from "~/ui/link-button";
import { HERO_BLURB, HERO_HEADLINE } from "~/components/homeCopy";

/**
 * The home hero: the generated `hero-home` scene as the section's still, with
 * `<Scene>` animating the planet, the stars and the shooting star over it. The
 * rocket on the ring is the stage's `::after` in `home.css`; it rides the
 * planet's ring, so its place is a fraction of the scene, not of the section.
 *
 * One primary button for the view, wrapped in `.btn-shadow`.
 */
export default function HeroSection() {
  return (
    <section className="hero home-hero">
      <Scene name="hero-home" />
      <div className="wrap">
        <h1 className="display">
          {HERO_HEADLINE.map((line, i) => (
            <Fragment key={line}>
              {i > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </h1>
        <p className="lead home-lead">{HERO_BLURB}</p>
        <div className="row home-cta">
          <span className="btn-shadow">
            <LinkButton
              href="/join"
              // Redirects off-site, not a page, so never prefetch.
              prefetch={false}
              variant="default"
              size="lg"
            >
              Join DevDogs
              <ArrowRightIcon weight="bold" />
            </LinkButton>
          </span>
          <LinkButton href="#events" variant="secondary" size="lg">
            See events
            <CalendarDotsIcon weight="bold" />
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
