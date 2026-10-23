"use client";

import type { ComponentProps } from "react";
import Helmet from "./Helmet";
import type { LeaderProfile } from "./profile";

interface Props extends ComponentProps<"button"> {
  profile: LeaderProfile;
}

/**
 * The always-visible face of an officer: helmet, name, titles. Renders as a
 * button because both hosts open something from it: the cluster opens the
 * popup on hover or focus, and below 1024px a tap opens the bottom sheet. A
 * button's content model is phrasing content, hence spans over divs.
 */
export default function LeaderTile({ profile, ...props }: Props) {
  return (
    <button type="button" className="home-ltile" {...props}>
      <Helmet profile={profile} sizes="75px" />
      <span>
        <span className="home-lname">{profile.name}</span>
        {profile.titles.map((title) => (
          <span key={title} className="home-ltitle">
            {title}
          </span>
        ))}
      </span>
    </button>
  );
}
