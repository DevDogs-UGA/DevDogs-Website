import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import PageSubtitleTemplate from "@/app/components/PageSubtitleTemplate";
import React from "react";
import Link from "next/link";

export default function page() {
  return (
    <div className="w-full section page-main-side-padding">
      <PageTitleTemplate redText="Us" blackText="Work With " reverse={true} />

      <div className="flex flex-col md:flex-row md:flex-wrap items-center justify-center text-center md:text-left px-2">
        <div className="md:basis-2/3 flex flex-col md:items-start justify-end md:h-[200px] md:mt-[15rem]">
          <PageSubtitleTemplate
            redText="Sponsor"
            blackText="Become a "
            reverse={true}
          />
          <p className="pb-10 md:block">
            Sponsors are imperative to DevDogs’ mission to bring perspectives
            together and build software with a purpose. Your generosity helps us
            provide an impactful software development experience for all.{" "}
          </p>
          <p className="md:pb-10 lg:pb-0">
            As a token of our appreciation, we are happy to provide a number of
            perks that you and your brand may enjoy. Learn more or make an
            inquiry today.
          </p>
        </div>

        <div className="md:basis-1/3 relative  bg-[#E4BBBB] w-[375px] h-[200px] rounded-t-[50px] mt-10 md:self-center  md:mt-0">
          <div className="relative top-full   bg-[#3A3A3A] w-[375px] h-[100px] rounded-b-[50px]">
            <p className="text-white pt-5 text-center">Example Perk Name</p>
          </div>
          <Link
            href="/contact"
            className=" bg-MidnightBlue transition duration-300 ease-in-out text-white hover:bg-MidnightBlue/75 w-[45%] absolute rounded-full -bottom-[11rem] left-2 h-[4rem] flex items-center justify-center"
          >
            <p>Contact Us</p>
          </Link>
          <Link
            href="/sponsor"
            className=" bg-BulldogRed text-white transition duration-300 ease-in-out hover:bg-BulldogRed/75 w-[45%] absolute rounded-full -bottom-[11rem] right-2 h-[4rem] flex items-center justify-center"
          >
            <p>Sponsor</p>
          </Link>
        </div>
      </div>
      <div className="flex flex-col items-center text-center px-2 mt-[15rem]">
        <PageSubtitleTemplate
          redText="Campus Partner"
          blackText="Become a "
          reverse={true}
        />
        <p className="pb-10 ">
          Are you a department or club at UGA looking to funnel pathways into
          your program? So are we!
        </p>
        <p className="pb-10 ">
          DevDogs is always happy to partner with campus initiatives to provide
          members across tech disciplines pathways and opportunities to see
          success outside our club.
        </p>
        <p>
          As a partner, we will promote each other’s initiatives, respect our
          niches, and do what we can to support our causes. Send us a note with
          the form below, we can’t wait to work with you!
        </p>

        <div className="relative bg-[#E4BBBB] w-[375px] h-[200px] rounded-t-[50px] mt-10">
          <div className="relative top-full bg-[#3A3A3A] w-[375px] h-[100px] rounded-b-[50px]">
            <p className="text-white pt-5">Example Perk Name</p>
          </div>
          <Link
            href="/contact"
            className=" bg-MidnightBlue transition duration-300 ease-in-out text-white hover:bg-MidnightBlue/75 w-[100%]  absolute rounded-full -bottom-[11rem] h-[4rem] flex items-center justify-center"
          >
            <p>Contact Us</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
