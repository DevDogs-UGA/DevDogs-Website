"use client";

import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import { useRouter } from "next/navigation";
import { useState } from "react";

const Settings = () => {
  const [password, setPassword] = useState("");
  const router = useRouter();

  const changePassword = async () => {
    const token = sessionStorage.getItem("access_token");

    if (password.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    } else {
      const res = await fetch(
        "https://api.devdogs.uga.edu/auth/updatePassword",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            password: password,
          }),
        },
      );
      await res.json();
      router.push("/dashboard");
    }
  };

  return (
    <div className="dashboard-section">
      <div className="page-main-side-padding flex w-full flex-col items-center text-center">
        <PageTitleTemplate
          blackText={"User "}
          redText={"Settings"}
          reverse={true}
        />
        <div className="flex w-8/12 flex-col rounded-[25px] bg-[#F5F5F5] p-4 lg:flex-row">
          <div className="w-full text-DevDogBlue lg:w-4/12">
            <h2 className="text-left text-xl font-bold">Categories</h2>
            <h3 className="text-left text-lg hover:underline">
              <a href="/dashboard">Personalization</a>
            </h3>
            <h3 className="-mt-4 text-left text-lg font-bold">
              <a href="/dashboard/security">Login & Security</a>
            </h3>
          </div>
          <div className="w-full lg:w-8/12">
            <h2 className="text-center text-xl font-bold">
              Account Credentials
            </h2>
            <h3 className="text-left font-semibold">Password</h3>
            <input
              type="password"
              className="w-11/12 rounded-full p-2"
              placeholder="P@55w0rd"
              onChange={(e) => setPassword(e.target.value)}
              value={password}
            />
            <div className="mt-4 flex flex-col justify-center gap-4 lg:flex-row">
              <div>
                <button
                  className="rounded-full bg-[#BA0C2F] p-2 px-2 text-lg font-semibold text-white"
                  onClick={changePassword}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
