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
        <div className="flex flex-wrap items-center justify-center my-[2rem]">
          <div className="md:flex-1 text-center sm:text-left">
            <h2 className="font-semibold text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">
              Hey UGA!
            </h2>
            <h1 className="font-extrabold text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">
              We&#39;re{" "}
              <div className="font-extrabold text-UGASecondary inline">
                DevDogs,
              </div>
            </h1>
          </div>

          <div className="md:flex-1">
            <Image
              id="mascot"
              src={logo}
              alt="DevDogs Logo"
              width="800"
              height="800"
              className="p-[22%]"
            />
          </div>
        </div>

        <div className="flex sm:flex-row-reverse flex-wrap items-center justify-center my-[2rem]">
          <div className="sm:flex-1 text-center sm:text-right mb-10 sm:my-0">
            <h1 className="text-lg md:text-xl">a team of</h1>
            <h1 className="text-lg md:text-xl">passionate</h1>
            <h1 className="font-semibold text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">
              Student
            </h1>
            <RolesHome />
            <h2 className="text-lg md:text-xl">at UGA.</h2>
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
          <div className="md:flex-1">
            <p className="font-semibold text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">
              <b className="font-semibold text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] text-[#BA0C2F] inline">
                We{" "}
              </b>
              develop some awesome software...
            </p>
            <p className="font-semibold mt-[10px] text-[1.5rem]">
              And we strive to better our{" "}
              <b className="font-semibold text-[#BA0C2F] text-[1.5rem] inline">
                {" "}
                community{" "}
              </b>{" "}
              through code.
            </p>
            <p className="mt-[10px]">
              Each year, we work hard to identify needs in Athens and solve them
              by taking solutions from concept to completion.
            </p>
          </div>
          <div className="md:flex-1">
            <Image src={mockup} alt="ACM OSP Bus App Mockup" />
          </div>
        </div>

        <div className="py-[2rem]">
          <h1 className="font-bold text-center text-[3rem]">
            Sound Interesting?
          </h1>
          <div className="button-grid">
            <Link
              target="_blank"
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
