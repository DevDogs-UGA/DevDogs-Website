"use client";

import { useState } from "react";

const TestEnv = () => {
  // Include components you want to test here.

  const [editing, setEditing] = useState(false);
  const [data, setData] =
    useState(`Member-provided biography. Lorem ipsum dolor sit amet consectetur.
            Id maecenas cras rhoncus vestibulum amet. Non vel augue risus erat
            neque. In in dui ut duis proin amet tempor leo. Convallis nunc diam
            turpis morbi in nunc. Feugiat iaculis facilisis ut et vitae nibh
            tristique tristique arcu dictum. Sagittis ultrices sodales
            pellentesque dolor placerat congue facilisis. Nam facilisi gravida
            arcu imperdiet faucibus sed et.`);

  return (
    <div className="section flex flex-col px-20">
      <div className="text-center my-[2rem]">
        <h1 className="font-bold text-[3.5rem] sm:text-[4.5rem] inline text-MidnightBlue">
          Reeyan{" "}
        </h1>
        <h1 className="text-GloryGloryRed font-bold text-[3.5rem] sm:text-[4.5rem] inline">
          Khimani
        </h1>
      </div>

      <div className="flex flex-col md:flex-row items-center">
        <div className="md:flex-col flex-row sm:w-1/2">
          <div className="text-5xl font-extrabold text-DevDogBlue m-2">
            Biography
          </div>

          <div className="text-xl m-2">
            <p>
              {!editing ? (
                data
              ) : (
                <textarea
                  className="w-full h-40"
                  value={data} // Set the value of textarea to your state
                  onChange={(e) => setData(e.target.value)} // Update the state when input changes
                />
              )}
            </p>
            <button onClick={() => setEditing(!editing)}>
              {!editing ? <p>Edit</p> : <p>Stop Editing</p>}
            </button>
          </div>
        </div>

        <div className="w-1/2 flex justify-center md:justify-end">
          <div className="officer-card m-5 w-full flex max-h-[350px] max-w-[350px] min-h-[200px] min-w-[200px] bg-[#E4BBBB] p-3 rounded-3xl">
            <img
              className="rounded-2xl"
              src={"https://github.com/" + "reeyank" + ".png"}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-row justify-center gap-5 md:justify-start">
        <img
          className="h-10 w-10"
          src="https://about.x.com/content/dam/about-twitter/x/brand-toolkit/logo-black.png.twimg.1920.png"
        />
        <img
          className="h-10 w-10"
          src="https://about.x.com/content/dam/about-twitter/x/brand-toolkit/logo-black.png.twimg.1920.png"
        />
        <img
          className="h-10 w-10"
          src="https://about.x.com/content/dam/about-twitter/x/brand-toolkit/logo-black.png.twimg.1920.png"
        />
        <img
          className="h-10 w-10"
          src="https://about.x.com/content/dam/about-twitter/x/brand-toolkit/logo-black.png.twimg.1920.png"
        />
      </div>

      <div className="text-center my-[2rem]">
        <h2 className="font-bold text-[2rem] sm:text-[3rem] inline text-GloryGloryRed">
          Roles{" "}
        </h2>
        <h2 className="text-MidnightBlue font-bold text-[2rem] sm:text-[3rem] inline">
          and{" "}
        </h2>
        <h2 className="font-bold text-[2rem] sm:text-[3rem] inline text-GloryGloryRed">
          Contributions
        </h2>
      </div>

      <div className="flex flex-col md:flex-row">
        <div className="w-1/2">
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
        </div>

        <div className="w-1/2">
          <div className="flex md:flex-col align-middle my-3 w-full md:items-end">
            <div className="text-2xl mr-8 font-bold inline min-w-fit">
              Commit Message
            </div>
            <div className="text-2xl">mm/dd/yy ##:##p ###points</div>
          </div>

          <div className="flex md:flex-col align-middle my-3 w-full md:items-end">
            <div className="text-2xl mr-8 font-bold inline min-w-fit">
              Action to Repo Name
            </div>
            <div className="text-2xl">mm/dd/yy ##:##p</div>
          </div>

          <div className="flex md:flex-col align-middle my-3 w-full md:items-end">
            <div className="text-2xl mr-8 font-bold inline min-w-fit">
              Action to Repo Name
            </div>
            <div className="text-2xl">mm/dd/yy ##:##p</div>
          </div>

          <div className="flex md:flex-col align-middle my-3 w-full md:items-end">
            <div className="text-2xl mr-8 font-bold inline min-w-fit">
              Action to Repo Name
            </div>
            <div className="text-2xl">mm/dd/yy ##:##p</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestEnv;
