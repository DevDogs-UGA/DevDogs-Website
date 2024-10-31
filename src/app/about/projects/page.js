"use client";
import Link from "next/link";
import Button from "../../components/Button";

const Page = () => {
  // Image arrays are for future use when we have more projects

  // const OPTIONS = { loop: true };

  // const SLIDES = Array.from(Array(SLIDE_COUNT).keys())
  // const currentProjects = [
  //   {
  //     image: TempProjectImage,
  //   },
  //   {
  //     image: TempProjectImage,
  //   },
  //   {
  //     image: TempProjectImage,
  //   },
  // ];

  // const pastProjects = [
  //   {
  //     image: TempProjectImage,
  //     title: "Project Name, 202#",
  //     description:
  //       "Brief description of project and its impact. Lorem ipsum dolor sit amet.",
  //   },
  //   {
  //     image: TempProjectImage,
  //     title: "Project Name, 203#",
  //     description:
  //       "Brief description of project and its impact. Lorem ipsum dolor sit amet.",
  //   },
  //   {
  //     image: TempProjectImage,
  //     title: "Project Name, 204#",
  //     description:
  //       "Brief description of project and its impact. Lorem ipsum dolor sit amet.",
  //   },
  // ];

  return (
    <div className="section page-main-side-padding container mx-auto w-[100%] text-center">
      <div className="my-[125px]">
        <h2 className="md:[5.5rem] inline text-[3.5rem] font-bold text-MidnightBlue sm:text-[4.5rem]">
          Our{" "}
        </h2>
        <h2 className="inline text-[3.5rem] font-bold text-GloryGloryRed sm:text-[4.5rem]">
          Projects
        </h2>
        <p className="pt-10 text-base sm:text-lg md:text-xl">
          Each year, DevDogs embarks on a new full-stack software project,
          collaborating on a concept from idea to implementation. Our software
          projects are always open-sourced and aligned to benefit the UGA or
          Athens community. After all, we’re the most familiar with its
          pain-points, so we’re the best equipped to help our people one project
          at a time. Take a look at what we’ve done below!
        </p>
      </div>
      <div className="mb-4">
        <h2 className="md:[4rem] inline text-[2.5rem] font-bold text-BulldogRed sm:text-[3.5rem]">
          Current{" "}
        </h2>
        <h2 className="md:[4rem] inline text-[2.5rem] font-bold text-MidnightBlue sm:text-[3.5rem]">
          Project
        </h2>

        <br />

        <h3 className="md:[3rem] text-[1.5rem] font-bold text-MidnightBlue sm:text-[2.5rem]">
          UGA Optimized Schedule Builder
        </h3>
      </div>

      {/* For future use when we have multiple projects being worked on in one semester for now we will focus on one main project */}
      {/* <EmblaCarousel slides={currentProjects} options={OPTIONS} /> */}

      {/* <div className="w-full container mx-auto">
        <Image src={TempProjectImage} className="rounded-3xl"/>
      </div> */}

      <p className="pt-10 text-base sm:text-lg md:text-xl">
        The UGA Optimized Schedule Builder will retrieve the current data
        available for courses and prepare an optimized schedule for students
        based on location, time, major, course details, and more. This resource
        will help students understand different schedules they can create to
        help them find and build an amazing course schedule for the upcoming
        semester.
      </p>

      <p className="pt-10 text-base sm:text-lg md:text-xl">
        Learn more about the project and the tools being used to build the
        application!
      </p>

      <Link
        href="https://github.com/DevDogs-UGA/Optimal-Schedule-Builder"
        className="red container mx-auto my-[75px] block max-w-[17rem] rounded-full py-3 font-semibold text-white transition duration-300 ease-in-out"
      >
        <Button className="">View</Button>
      </Link>
      {/* For future use when we have past projects to show */}

      <div className="pb-4">
        {/* <h2 className=" font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] text-BulldogRed inline">
     Past{" "}
    </h2>
    <h2 className="font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] text-black inline">
     Projects
    </h2> */}
      </div>

      {/* Carousel */}
      <div>
        {/* <EmblaCarousel slides={pastProjects} options={OPTIONS} /> */}
      </div>
    </div>
  );
};

export default Page;
