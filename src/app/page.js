"use client";
import "./Home.css";
import Button from "./components/Button";
import logo from "./images/logo.png";
import devdogswelcome from "./images/devdogswelcome.png";
import mockup from "./images/mockup.png";
import Image from "next/image";
import Link from "next/link";
import RolesHome from "./components/RolesHome";

const Home = () => {
  return (
    <section id="base-background">
      <div className="section section-home page-main-side-padding">
        <div className="my-[2rem] flex flex-wrap items-center justify-center">
          <div className="md:flex-2 text-center sm:text-left">
            <h2 className="text-[2rem] font-semibold leading-10 text-MidnightBlue md:text-[2.5rem] lg:text-[3rem]">
              Hey UGA!
            </h2>

            <h1 className="inline text-[2rem] font-bold text-MidnightBlue sm:text-[3.5rem] md:text-[4rem] lg:text-[4.5rem]">
              We&#39;re{" "}
            </h1>
            <h1 className="inline text-[2rem] font-bold text-GloryGloryRed sm:text-[3.5rem] md:text-[4rem] lg:text-[4.5rem]">
              DevDogs,
            </h1>
          </div>

          <div className="md:flex-1">
            <Image
              id="mascot"
              src={logo}
              alt="DevDogs Logo"
              className="p-[22%]"
            />
          </div>
        </div>

        <div className="my-[2rem] flex flex-wrap items-center justify-center sm:flex-row-reverse">
          <div className="mb-10 text-center leading-[3.75rem] sm:my-0 sm:flex-1 sm:text-right sm:leading-[4rem] md:leading-[5rem]">
            <p className="text-[2rem] font-semibold leading-3 text-DevDogBlue md:text-[2.5rem] lg:text-[3rem]">
              a team of
            </p>
            <p className="text-[2rem] font-semibold text-DevDogBlue md:text-[2.5rem] lg:text-[3rem]">
              passionate
            </p>
            <h1 className="text-[3rem] font-semibold text-MidnightBlue md:text-[4rem] lg:text-[5rem]">
              Student
            </h1>
            <RolesHome />
            <p className="text-[1.5rem] font-semibold text-DevDogBlue lg:text-[2rem]">
              at UGA.
            </p>
          </div>

          <div className="sm:flex-1">
            <Image
              src={devdogswelcome}
              alt="DevDogs Welcome"
              width="600"
              height="300"
            />
          </div>
        </div>

        <div className="my=[2rem] my-[50px] flex flex-wrap items-center justify-center text-center sm:text-left">
          <div className="leading-[2.5rem] sm:leading-[3rem] md:flex-1 md:leading-[3.5rem]">
            <h2 className="inline text-[2.5rem] font-semibold text-BulldogRed md:text-[3.5rem] lg:text-[4rem]">
              We <> </>
            </h2>

            <h2 className="inline text-[2.5rem] font-semibold text-MidnightBlue md:text-[3.5rem] lg:text-[4rem]">
              develop some <br />
              awesome <br />
              software
            </h2>
            <p className="inline text-[2.5rem] font-semibold md:text-[3.5rem] lg:text-[4rem]">
              ...
            </p>
            <p className="mb-2 py-2 text-xl font-semibold text-DevDogBlue md:text-2xl">
              And we strive to better our community through code.
            </p>
            <p className="text-lg text-DevDogBlue md:text-xl">
              Each year, we work hard to identify needs in Athens and solve them
              by taking solutions from concept to completion.
            </p>
          </div>
          <div className="md:flex-1">
            <Image src={mockup} alt="ACM OSP Bus App Mockup" />
          </div>
        </div>

        <div className="py-[2rem]">
          <h1 className="text-center text-[3rem] font-bold text-MidnightBlue">
            Sound Interesting?
          </h1>
          <div className="button-grid">
            <Link
              href="/about"
              className="m-4 rounded-full bg-black p-2 text-lg font-medium text-white transition delay-150 ease-in-out hover:bg-white hover:text-black md:text-xl"
            >
              <Button>Learn More</Button>
            </Link>
            <Link
              target="_blank"
              href="https://discord.com/invite/MuyJ4f5xKE"
              className="m-4 rounded-full bg-[#BA0C2F] p-2 text-lg font-medium text-white transition delay-150 ease-in-out hover:bg-white hover:text-black md:text-xl"
            >
              <Button>Join Us!</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Home;
