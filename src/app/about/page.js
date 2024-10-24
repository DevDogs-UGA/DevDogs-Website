"use client";

import Image from "next/image";
import mockup from "../images/mockup.png";
import devdogswelcome from "../images/devdogswelcome.png";
import Button from "../components/Button";
import Link from "next/link";
import EmblaCarousel from "../components/EmblaCarousel";
import Caoursel1 from "@/app/images/carousel1.png";
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
    },
    {
      image: Caoursel2,
    },
    {
      image: Caoursel3,
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

        <div className="page-main-side-padding flex flex-col flex-nowrap items-center justify-between text-center sm:my-[8rem] sm:text-left md:flex-row">
          <div className="basis-1/2">
            <h2 className="inline text-[2rem] font-bold text-BulldogRed md:text-[2.5rem] lg:text-[3rem]">
              Who{" "}
            </h2>
            <h2 className="inline text-[2rem] font-bold text-MidnightBlue md:text-[2.5rem] lg:text-[3rem]">
              We Are
            </h2>

            <p className="text-[1.1rem] font-semibold text-DevDogBlue md:text-[1.3rem] lg:text-[1.5rem]">
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

        <div className="page-main-side-padding flex flex-col flex-nowrap items-center justify-between text-center sm:my-[8rem] sm:text-left md:flex-row">
          <div className="basis-1/2">
            <h2 className="inline text-[2rem] font-bold text-BulldogRed md:text-[2.5rem] lg:text-[3rem]">
              Our{" "}
            </h2>
            <h2 className="inline text-[2rem] font-bold text-MidnightBlue md:text-[2.5rem] lg:text-[3rem]">
              Mission
            </h2>
            <p className="text-[1.1rem] font-semibold text-DevDogBlue md:text-[1.3rem] lg:text-[1.5rem]">
              Above all, we aim to provide a space for passionate students from
              all disciplines to take ownership of meaningful software projects.
            </p>
            <br />
            <p className="text-[1.1rem] font-semibold text-DevDogBlue md:text-[1.3rem] lg:text-[1.5rem]">
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

        <div className="text-center">
          <h2 className="inline text-[2rem] font-bold text-MidnightBlue md:text-[2.5rem] lg:text-[3rem]">
            Our{" "}
          </h2>
          <h2 className="inline text-[2rem] font-bold text-BulldogRed md:text-[2.5rem] lg:text-[3rem]">
            Impact
          </h2>
          <br />

          <EmblaCarousel
            slides={imagesForCarousel}
            banner={false}
            options={OPTIONS}
          />
        </div>
        <div className="page-main-side-padding py-[2rem]">
          <h1 className="my-5 text-center text-[3rem] font-bold text-MidnightBlue">
            More Info
          </h1>
          <div className="flex flex-nowrap items-center justify-center gap-[2rem] py-4">
            <Link
              href="/about/projects"
              className="blue rounded-full px-4 py-2 text-lg font-medium text-white transition delay-150 ease-in-out sm:px-6 md:text-xl"
            >
              <Button>All Projects</Button>
            </Link>
            <Link
              target="_blank"
              href="/about/people"
              className="red rounded-full px-4 py-2 text-lg font-medium text-white transition delay-150 ease-in-out sm:px-6 md:text-xl"
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
