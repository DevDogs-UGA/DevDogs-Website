"use client";

import { useState, useEffect } from "react";

const Issues_Points = ({ github }) => {
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState(null);
  const token = sessionStorage.getItem("access_token");

  useEffect(() => {
    const fetchIssues = async () => {
      const response = await fetch(
        "http://localhost:4000/users/issues?github=" + github,
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
    <div className="mt-6 flex flex-row md:flex-row md:justify-end">
      <div className="md:w-1/2 md:items-end">
        {issues &&
          issues.map((issue) => (
            <div
              key={issue.title}
              className="my-3 mt-4 flex w-full flex-col text-end align-middle md:mt-0 md:items-end"
            >
              <div className="mr-3 inline min-w-fit text-2xl font-bold">
                {issue.title}
              </div>
              <div className="mr-3 text-lg font-semibold">
                {issue.points.toFixed(0) + " Points"}
              </div>
              <div className="mr-3 text-lg">{issue.designation || null}</div>
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
