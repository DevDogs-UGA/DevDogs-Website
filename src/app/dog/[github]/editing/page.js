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

// eslint-disable-next-line react/prop-types
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
      // eslint-disable-next-line react/prop-types
      "https://api.devdogs.uga.edu/users/pages?github=" + params.github,
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
      const response = await fetch("https://api.devdogs.uga.edu/auth/session", {
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
      <h2 className="text-4xl text-center mt-10">You are not authenticated</h2>
    );
  }

  if (!paid) {
    return (
      <div>
        <h1 className="text-4xl text-center mt-10">User Page not Found</h1>
      </div>
    );
  }

  return (
    <div className="section flex flex-col px-20">
      {}
      <div className="text-center my-[2rem]">
        <h1 className="font-bold text-[3.5rem] sm:text-[4.5rem] inline text-MidnightBlue">
          {first_name + " "}
        </h1>
        <h1 className="text-GloryGloryRed font-bold text-[3.5rem] sm:text-[4.5rem] inline">
          {last_name}
        </h1>
      </div>

      <div className="flex flex-col md:flex-row items-center">
        <div className="md:flex-col flex-row sm:w-1/2">
          <h3 className="text-left">
            Edit your info in{" "}
            <a href="/dashboard" className="hover:underline text-[#00A3AD]">
              Dashboard
            </a>
            . Only you can see this message.
          </h3>
          <div className="text-5xl font-extrabold text-DevDogBlue m-2">
            Biography
          </div>

          <div className="text-xl m-2">{bio}</div>
        </div>

        <div className="w-1/2 flex justify-center md:justify-end flex-col">
          <div className="officer-card m-5 flex bg-[#E4BBBB] p-3 rounded-3xl flex-col self-center md:self-end">
            <img
              className="rounded-2xl  max-h-[400px] max-w-[350px] min-h-[200px] min-w-[200px] self-center"
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
        <div className="flex flex-row justify-center gap-5 md:justify-start align-middle md:ml-3 md:mt-3">
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
              className="bg-BulldogRed mt-4 md:w-1/3 w-full self-center rounded-full text-white text-sm p-2 text-center"
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
