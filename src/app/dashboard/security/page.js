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
    <div className="text-center w-full section page-main-side-padding flex flex-col items-center">
      <PageTitleTemplate
        blackText={"User "}
        redText={"Settings"}
        reverse={true}
      />
      <div className="bg-[#F5F5F5] w-8/12 rounded-[25px] flex flex-col lg:flex-row p-4">
        <div className="w-full lg:w-4/12 text-DevDogBlue">
          <h2 className="font-bold text-xl text-left">Categories</h2>
          <h3 className="text-lg text-left hover:underline">
            <a href="/dashboard">Personalization</a>
          </h3>
          <h3 className="text-lg text-left -mt-4 font-bold">
            <a href="/dashboard/security">Login & Security</a>
          </h3>
        </div>
        <div className="w-full lg:w-8/12">
          <h2 className="font-bold text-xl text-center">Account Credentials</h2>
          <h3 className="text-left font-semibold">Password</h3>
          <input
            type="password"
            className="p-2 w-11/12 rounded-full"
            placeholder="P@55w0rd"
            onChange={(e) => setPassword(e.target.value)}
            value={password}
          />
          <div className="flex justify-center gap-4 flex-col lg:flex-row mt-4">
            <div>
              <button
                className="bg-[#E37C7C] text-white px-2 p-2 rounded-full"
                onClick={changePassword}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
