"use client";
import { useState, useEffect } from "react";

const LeaderBoard = () => {
  const [contributors, setContributors] = useState(null);

  useEffect(() => {
    async function fetchContributors() {
      let res = await fetch(
        "https://express-api-olive-psi.vercel.app/getLeaderBoard",
        {
          cache: "no-store",
        },
      );
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
          <div className="officer-card m-2">
            <img
              id="pic"
              src={"https://github.com/" + member.githubLogin + ".png"}
            />
            <div id="officer-description">
              <br />
              <a
                href={"https://github.com/" + member.githubLogin}
                target="_blank"
                className="officer-name font-bold"
                rel="noreferrer"
              >
                {member.fullName}
              </a>
              <p id="officer-title-name">{Math.round(member.points)} points</p>
              <br />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LeaderBoard;
