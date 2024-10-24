"use client";

import { useState, useEffect } from "react";

const Issues_Points = ({ github }) => {
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState(null);
  const token = sessionStorage.getItem("access_token");

  useEffect(() => {
    const fetchIssues = async () => {
      const response = await fetch(
        "https://api.devdogs.uga.edu/users/issues?github=" + github,
        {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
        },
      );

      const data = await response.json();
      setIssues(data.data.issues);
      setLoading(false);
    };
    fetchIssues();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="flex flex-row md:flex-row md:justify-end mt-6">
      <div className="md:w-1/2 md:items-end">
        {issues &&
          issues.map((issue) => (
            <div
              key={issue.title}
              className="flex mt-4 md:mt-0 flex-col align-middle my-3 w-full md:items-end text-end"
            >
              <div className="text-2xl mr-3 font-bold inline min-w-fit">
                {issue.title}
              </div>
              <div className="text-lg mr-3 font-semibold">
                {issue.points.toFixed(0) + " Points"}
              </div>
              <div className="text-lg mr-3">{issue.designation || null}</div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default Issues_Points;

// ROLES & POSITIONS
/* <div className="w-1/2">
          <div className="flex flex-row align-middle my-3">
            <div className="text-2xl mr-8 font-bold inline min-w-fit">
              Role Name
            </div>
            <div className="text-2xl">202#-202#</div>
          </div>
          <div className="flex flex-row align-middle my-3">
            <div className="text-2xl mr-8 font-bold inline min-w-fit">
              Role Name
            </div>
            <div className="text-2xl">202#-202#</div>
          </div>
          <div className="flex flex-row align-middle my-3">
            <div className="text-2xl mr-8 font-bold inline min-w-fit">
              Role Name
            </div>
            <div className="text-2xl">202#-202#</div>
          </div>
          <div className="flex flex-row align-middle my-3">
            <div className="text-2xl mr-8 font-bold inline min-w-fit">
              Role Name
            </div>
            <div className="text-2xl">202#-202#</div>
          </div>
        </div> */
