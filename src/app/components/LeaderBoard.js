"use client";
import { useState, useEffect } from "react";
import GithubPicture from "./GithubPicture";

const LeaderBoard = () => {
  const [contributors, setContributors] = useState(null);

  useEffect(() => {
    async function fetchContributors() {
      let res = await fetch("https://api.devdogs.uga.edu/getLeaderBoard", {
        cache: "no-store",
      });
      let data = await res.json();
      setContributors(data);
    }
    fetchContributors();
  }, []);

  if (!contributors) return <div>Loading...</div>;

  return (
    <div className="flex flex-wrap">
      {contributors.map((member) => (
        <div
          key={member.githubLogin}
          className="flex w-full sm:w-1/2 md:w-1/3 lg:w-1/4 mb-4 justify-center"
        >
          <GithubPicture member={member} />
        </div>
      ))}
    </div>
  );
};

export default LeaderBoard;