"use client";

import LeaderCard from "./LeaderCard";

const LeaderBoard = async () => {
    let data = await fetch('http://localhost:4000/getLeaderBoard')
    let leaders = await data.json()

  return (
    <div className="section flex flex-col">
        <div className="text-center my-[2rem]">
            <h1 className="font-bold text-[3.5rem] sm:text-[4.5rem] inline text-MidnightBlue">
            Points{" "}
            </h1>
            <h1 className="text-GloryGloryRed font-bold text-[3.5rem] sm:text-[4.5rem] inline">
            Leaderboard
            </h1>
        </div>

        <div className="flex flex-col items-center">
            {leaders.map((leader, key) => (
                <LeaderCard key={key} github={leader.githubLogin} points={leader.points.toFixed(2)} />
            ))}
        </div>
    </div>
  );
};

export default LeaderBoard;
