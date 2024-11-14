"use client";

import { EnvelopeIcon } from "@heroicons/react/24/solid";
import {
  GitHubLogoIcon,
  InstagramLogoIcon,
  LinkedInLogoIcon,
  CodeIcon,
} from "@radix-ui/react-icons";
import Issues_Points from "@/app/components/Issues_Points";
import { useEffect, useState } from "react";

export default function Page({ params }) {
  const [loading, setLoading] = useState(true);
  const [resumeLink, setResumeLink] = useState(null);
  const [linkedinLink, setLinkedinLink] = useState(null);
  const [contactEmail, setContactEmail] = useState(null);
  const [githubLink, setGithubLink] = useState(null);
  const [instagramLink, setInstagramLink] = useState(null);
  const [personalLink, setPersonalLink] = useState(null);
  const [bio, setBio] = useState(null);
  const [pfpLink, setPfpLink] = useState(null);
  const [first_name, setFirstName] = useState(null);
  const [last_name, setLastName] = useState(null);
  const [github, setGitub] = useState(null);
  const [paid, setPaid] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  async function fetchUser() {
    const res = await fetch(
      "http://localhost:4000/users/pages?github=" + params.github,
      {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    let data = await res.json();

    console.log(await data);
    setResumeLink(
      (await data.user_page?.userInfo?.user_page?.resume_link) || null,
    );
    setLinkedinLink(
      (await data.user_page?.userInfo?.user_page?.linkedin_link) || null,
    );
    setContactEmail(
      (await data.user_page?.userInfo?.user_page?.contact_email) || null,
    );
    setGithubLink(
      (await data.user_page?.userInfo?.user_page?.github_link) || null,
    );
    setInstagramLink(
      (await data.user_page?.userInfo?.user_page?.instagram_link) || null,
    );
    setPersonalLink(
      (await data.user_page?.userInfo?.user_page?.personal_link) || null,
    );
    setBio((await data.user_page?.userInfo?.user_page?.bio) || null);
    setPfpLink((await data.user_page?.userInfo?.user_page?.pfp_link) || null);
    setFirstName((await data.user_page?.userInfo.first_name) || null);
    setLastName((await data.user_page?.userInfo.last_name) || null);
    setGitub((await data.user_page?.userInfo.users?.githubLogin) || null);
    setPaid((await data.user_page?.userInfo?.user_page?.paid) || false);
    setLoading(false);
  }

  const checkAuthentication = async () => {
    try {
      const response = await fetch("http://localhost:4000/auth/session", {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log(response);

      if (response.ok) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error("Failed to check authentication:", err);
    }
  };

  useEffect(() => {
    checkAuthentication();
    fetchUser();
  }, []);

  if (loading) return <div>Loading...</div>;

  if (!isAuthenticated) {
    return (
      <h2 className="mt-10 text-center text-4xl">You are not authenticated</h2>
    );
  }

  if (!paid) {
    return (
      <div>
        <h1 className="mt-10 text-center text-4xl">User Page not Found</h1>
      </div>
    );
  }

  return (
    <div className="section flex flex-col px-20">
      {}
      <div className="my-[2rem] text-center">
        <h1 className="inline text-[3.5rem] font-bold text-MidnightBlue sm:text-[4.5rem]">
          {first_name + " "}
        </h1>
        <h1 className="inline text-[3.5rem] font-bold text-GloryGloryRed sm:text-[4.5rem]">
          {last_name}
        </h1>
      </div>

      <div className="flex flex-col items-center md:flex-row">
        <div className="flex-row sm:w-1/2 md:flex-col">
          <h3 className="text-left">
            Edit your info in{" "}
            <a href="/dashboard" className="text-[#00A3AD] hover:underline">
              Dashboard
            </a>
            . Only you can see this message.
          </h3>
          <div className="m-2 text-5xl font-extrabold text-DevDogBlue">
            Biography
          </div>

          <div className="m-2 text-xl">{bio}</div>
        </div>

        <div className="flex w-1/2 flex-col justify-center md:justify-end">
          <div className="officer-card m-5 flex flex-col self-center rounded-3xl bg-[#E4BBBB] p-3 md:self-end">
            <img
              className="max-h-[400px] min-h-[200px] min-w-[200px] max-w-[350px] self-center rounded-2xl"
              src={
                pfpLink ||
                "https://github.com/" + github + ".png" ||
                "https://placeholder.co/128x128"
              }
            />
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="flex flex-row justify-center gap-5 align-middle md:ml-3 md:mt-3 md:justify-start">
          {linkedinLink ? (
            <a href={linkedinLink} target="_blank" rel="noreferrer">
              <LinkedInLogoIcon className="h-10 w-10" />
            </a>
          ) : null}

          {instagramLink ? (
            <a href={instagramLink} target="_blank" rel="noreferrer">
              <InstagramLogoIcon className="h-10 w-10" />
            </a>
          ) : null}

          {githubLink ? (
            <a href={githubLink} target="_blank" rel="noreferrer">
              <GitHubLogoIcon className="h-10 w-10" />
            </a>
          ) : null}

          {personalLink ? (
            <a href={personalLink} target="_blank" rel="noreferrer">
              <CodeIcon className="h-10 w-10" />
            </a>
          ) : null}

          {contactEmail ? (
            <a href={"mailto:" + contactEmail} target="_blank" rel="noreferrer">
              <EnvelopeIcon className="h-10 w-10" />
            </a>
          ) : null}
        </div>
        {resumeLink ? (
          <div className="flex justify-end">
            <a
              href={resumeLink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 w-full self-center rounded-full bg-BulldogRed p-2 text-center text-sm text-white md:w-1/3"
            >
              View Resume
            </a>
          </div>
        ) : null}
      </div>

      {/* <div className="text-center my-[2rem]">
        <h2 className="font-bold text-[2rem] sm:text-[3rem] inline text-GloryGloryRed">
          Roles{" "}
        </h2>
        <h2 className="text-MidnightBlue font-bold text-[2rem] sm:text-[3rem] inline">
          and{" "}
        </h2>
        <h2 className="font-bold text-[2rem] sm:text-[3rem] inline text-GloryGloryRed">
          Contributions
        </h2>
      </div> */}

      <Issues_Points github={github} />
    </div>
  );
}
