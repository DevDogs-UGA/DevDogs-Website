"use client";

import Image from "next/image";
import mockup from "../images/mockup.png";
import devdogswelcome from "../images/devdogswelcome.png";
import Button from "../components/Button";
import Link from "next/link";
import EmblaCarousel from "../components/EmblaCarousel";
import Caoursel1 from "@/app/images/athena-frontpage.png";
import Caoursel2 from "@/app/images/carousel2.jpg";
import Caoursel3 from "@/app/images/carousel3.jpg";
import PageTitleTemplate from "../components/PageTitleTemplate";

// The link for the "All Projects" button goes to the discord because there is not a projects page yet.
// The link for the "Our People" buttongoes to the Team page until the our People page is complete.

const AboutPage = () => {
  const OPTIONS = { loop: true };
  const imagesForCarousel = [
    {
      image: Caoursel1,
      title: "Optimal Schedule Builder, 2024",
      description: "Website to help UGA's 40,000 students graduate earlier and maximize their day.",
    },
    {
      image: Caoursel2,
      title: "Project Name, 202#",
    },
    {
      image: Caoursel3,
      title: "Project Name, 202#",
    },
  ];

  return (
    <div>
      <div className="section">
        <PageTitleTemplate
          blackText={"More "}
          redText={"About Us"}
          reverse={true}
        />

        <div className="sm:my-[8rem] text-center sm:text-left flex flex-col md:flex-row flex-nowrap items-center justify-between page-main-side-padding">
          <div className="basis-1/2">
            <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-BulldogRed">
              Who{" "}
            </h2>
            <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-MidnightBlue">
              We Are
            </h2>

            <p className="font-semibold text-[1.1rem] md:text-[1.3rem] lg:text-[1.5rem] text-DevDogBlue">
              DevDogs is a student-run club at UGA dedicated to benefiting our
              community through code. Each year, we work together to develop
              impactful software from concept to completion, learning real-world
              skills and industry-standard tech along the way.{" "}
            </p>
          </div>
          <div className="basis-1/2 py-10">
            <Image src={devdogswelcome} alt="DevDogs Welcome" />
          </div>
        </div>

        <div className="sm:my-[8rem] text-center sm:text-left flex flex-col md:flex-row flex-nowrap items-center justify-between page-main-side-padding">
          <div className="basis-1/2">
            <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-BulldogRed">
              Our{" "}
            </h2>
            <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-MidnightBlue">
              Mission
            </h2>
            <p className="font-semibold text-[1.1rem] md:text-[1.3rem] lg:text-[1.5rem] text-DevDogBlue">
              Above all, we aim to provide a space for passionate students from
              all disciplines to take ownership of meaningful software projects.
            </p>
            <br />
            <p className="font-semibold text-[1.1rem] md:text-[1.3rem] lg:text-[1.5rem] text-DevDogBlue">
              In the process, we hope to build a network of awesome people,
              refine skills for our career, and learn how to incite change of
              our own, one project at a time.
            </p>
          </div>
          <div className="basis-1/2 py-10">
            <Image
              id="mockup"
              src={mockup}
              alt="ACM OSP Mockup"
              width="650"
              height="325"
            />
          </div>
        </div>

        <div className="text-center ">
          <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-MidnightBlue">
            Our{" "}
          </h2>
          <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-BulldogRed">
            Impact
          </h2>
          <br />

          <EmblaCarousel
            slides={imagesForCarousel}
            banner={false}
            options={OPTIONS}
          />
        </div>
        <div className="py-[2rem] page-main-side-padding">
          <h1 className="font-bold text-center text-[3rem] my-5 text-MidnightBlue">
            More Info
          </h1>
          <div className="flex items-center flex-nowrap justify-center gap-[2rem] py-4">
            <Link
              href="/about/projects"
              className="text-lg md:text-xl rounded-full font-medium  py-2 px-4 sm:px-6 transition ease-in-out delay-150 bg-DevDogBlue text-white hover:bg-black hover:text-white "
            >
              <Button>All Projects</Button>
            </Link>
            <Link
              target="_blank"
              href="/about/people"
              className="text-lg md:text-xl rounded-full font-medium  py-2 px-4 sm:px-6 transition ease-in-out delay-150 text-white bg-[#BA0C2F] hover:bg-black hover:text-white "
            >
              <Button>Our People</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
