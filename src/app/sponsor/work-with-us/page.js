"use client";
import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import { useState, useEffect } from "react";
import PageSubtitleTemplate from "@/app/components/PageSubtitleTemplate";
import React from "react";
import Link from "next/link";

export default function Page() {
  const perks = [
    { image: "/testImage1.png", name: "perk 1" },
    { image: "/testImage2.png", name: "perk 2" },
    { image: "/testImage3.png", name: "perk 3" },
    { image: "/testImage4.png", name: "perk 4" },
    { image: "/testImage5.svg", name: "perk 5" },
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % perks.length);
    }, 10000); // Change image every 10 seconds

    return () => clearInterval(interval); // Cleanup interval on unmount
  }, []);

  return (
    <div className="w-full section page-main-side-padding">
      <PageTitleTemplate redText="Us" blackText="Work With " reverse={true} />

      <div className="flex flex-col justify-center xl:flex-row items-center">
        <div className="xl:relative xl:top-20 xl:basis-[60%] xl:mr-[3rem] text-center xl:text-left">
          <PageSubtitleTemplate
            redText="Sponsor"
            blackText="Become a "
            reverse={true}
          />
          <p className="pb-10">
            Sponsors are imperative to DevDogs’ mission to bring perspectives
            together and build software with a purpose. Your generosity helps us
            provide an impactful software development experience for all.{" "}
          </p>
          <p>
            As a token of our appreciation, we are happy to provide a number of
            perks that you and your brand may enjoy. Learn more or make an
            inquiry today.
          </p>
        </div>

        {/* Image and Perk Card with Fade-in/Fade-out Animation */}
        <div className="xl:basis-[40%] relative w-[375px] h-[200px] rounded-t-[50px] mt-[4rem] md:self-center xl:mt-0">
          <img
            src={perks[currentImageIndex].image}
            alt={perks[currentImageIndex].name}
            className="animate-fadeInOut absolute inset-0 w-full h-full object-cover rounded-t-[50px]"
          />
          <div className="animate-fadeInOut relative top-full bg-[#3A3A3A] h-[100px] rounded-b-[50px]">
            <p className="text-white pt-5 text-center">
              {perks[currentImageIndex].name}
            </p>
          </div>

          <Link
            href="/contact"
            className="bg-MidnightBlue transition duration-300 ease-in-out text-white hover:bg-[#1a1a26] w-[45%] absolute rounded-full -bottom-[11rem] left-2 h-[4rem] flex items-center justify-center"
          >
            <p>Contact Us</p>
          </Link>
          <Link
            href="/sponsor"
            className="bg-BulldogRed text-white transition duration-300 ease-in-out hover:bg-[#7e0820] w-[45%] absolute rounded-full -bottom-[11rem] right-2 h-[4rem] flex items-center justify-center"
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
          className="text-center"
        />

        <div className="flex flex-col justify-center xl:flex-row-reverse items-center">
          <div className="xl:relative xl:top-20 xl:basis-[60%] xl:ml-[3rem] text-center xl:text-right">
            <p className="pb-10 ">
              Are you a department or club at UGA looking to funnel pathways
              into your program? So are we!
            </p>
            <p className="pb-10">
              DevDogs is always happy to partner with campus initiatives to
              provide members across tech disciplines pathways and opportunities
              to see success outside our club.
            </p>
            <p>
              As a partner, we will promote each other’s initiatives, respect
              our niches, and do what we can to support our causes. Send us a
              note with the form below, we can’t wait to work with you!
            </p>
          </div>

          <div className="xl:basis-[40%] relative w-[375px] h-[200px] rounded-t-[50px] mt-10 xl:mt-0">
            <img
              src={perks[currentImageIndex].image}
              alt={perks[currentImageIndex].name}
              className="animate-fadeInOut absolute inset-0 w-full h-full object-cover rounded-t-[50px]"
            />
            <div className="animate-fadeInOut relative top-full bg-[#3A3A3A] h-[100px] rounded-b-[50px]">
              <p className="text-white pt-5 text-center">
                {perks[currentImageIndex].name}
              </p>
            </div>
            <Link
              href="/contact"
              className="bg-MidnightBlue transition duration-300 ease-in-out text-white hover:bg-[#1a1a26] w-[100%] absolute rounded-full -bottom-[11rem] h-[4rem] flex items-center justify-center"
            >
              <p>Contact Us</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
