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
      <div className="section section-home page-main-side-padding ">
        <div className="flex flex-wrap items-center justify-center my-[2rem]">
          <div className="md:flex-2 text-center sm:text-left">
            <h2 className="font-semibold text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-MidnightBlue leading-10">
              Hey UGA!
            </h2>

            <h1 className="inline font-bold text-[2rem] sm:text-[3.5rem] md:text-[4rem] lg:text-[4.5rem] text-MidnightBlue">
              We&#39;re{" "}
            </h1>
            <h1 className="inline font-bold text-GloryGloryRed text-[2rem] sm:text-[3.5rem] md:text-[4rem] lg:text-[4.5rem] ">
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

        <div className="flex sm:flex-row-reverse flex-wrap items-center justify-center my-[2rem]">
          <div className="sm:flex-1 text-center sm:text-right mb-10 sm:my-0 leading-[3.75rem] sm:leading-[4rem] md:leading-[5rem]">
            <p className="font-semibold text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-DevDogBlue leading-3">
              a team of
            </p>
            <p className="font-semibold text-[2rem] md:text-[2.5rem] lg:text-[3rem]  text-DevDogBlue">
              passionate
            </p>
            <h1 className="font-semibold text-[3rem] md:text-[4rem] lg:text-[5rem] text-MidnightBlue">
              Student
            </h1>
            <RolesHome />
            <p className="text-DevDogBlue font-semibold text-[1.5rem] lg:text-[2rem]">
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

        <div className="flex flex-wrap items-center justify-center my-[50px] text-center sm:text-left my=[2rem]">
          <div className="md:flex-1 leading-[2.5rem] sm:leading-[3rem] md:leading-[3.5rem]">
            <h2 className="font-semibold text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] inline text-BulldogRed">
              We <> </>
            </h2>

            <h2 className="font-semibold text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] inline text-MidnightBlue">
              develop some <br />
              awesome <br />
              software
            </h2>
            <p className="inline font-semibold text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">
              ...
            </p>
            <p className="text-xl md:text-2xl font-semibold py-2 mb-2 text-DevDogBlue">
              And we strive to better our community through code.
            </p>
            <p className="text-lg md:text-xl text-DevDogBlue">
              Each year, we work hard to identify needs in Athens and solve them
              by taking solutions from concept to completion.
            </p>
          </div>
          <div className="md:flex-1">
            <Image src={mockup} alt="ACM OSP Bus App Mockup" />
          </div>
        </div>

        <div className="py-[2rem]">
          <h1 className="font-bold text-center text-[3rem] text-MidnightBlue">
            Sound Interesting?
          </h1>
          <div className="button-grid">
            <Link
              href="/about"
              className="text-lg md:text-xl rounded-full font-medium m-4 p-2 transition ease-in-out delay-150 text-white bg-black hover:bg-white hover:text-black "
            >
              <Button>Learn More</Button>
            </Link>
            <Link
              target="_blank"
              href="https://discord.com/invite/MuyJ4f5xKE"
              className="text-lg md:text-xl rounded-full font-medium m-4 p-2 transition ease-in-out delay-150 text-white bg-[#BA0C2F] hover:bg-white hover:text-black "
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
