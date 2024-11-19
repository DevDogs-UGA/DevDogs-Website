"use client";
import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import { useState, useEffect } from "react";
import PageSubtitleTemplate from "@/app/components/PageSubtitleTemplate";
import React from "react";
import Link from "next/link";
import Image from "next/image";

export default function Page() {
  const SponsorPerks = [
    { image: "/SponsorPerk1.jpg", name: "Host Recruitment Sessions" },
    { image: "/SponsorPerk2.png", name: "Reach UGA's Top Developers" },
    { image: "/SponsorPerk3.png", name: "Support our Community Projects" },
  ];

  const CampusPerks = [
    { image: "/CampusPerk1.jpg", name: "Co-host Meetings" },
    { image: "/CampusPerk2.jpg", name: "Establish Pipelines for Students" },
    { image: "/CampusPerk3.png", name: "Promote Your Organization" },
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [fadeType, setFadeType] = useState("fadeIn");

  useEffect(() => {
    const fadeOutTimeout = setTimeout(() => setFadeType("fadeOut"), 4500);
    const interval = setInterval(() => {
      setFadeType("fadeIn");
      setCurrentImageIndex(
        (prevIndex) => (prevIndex + 1) % SponsorPerks.length,
      );
    }, 9000);

    return () => {
      clearTimeout(fadeOutTimeout);
      clearInterval(interval);
    };
  }, [currentImageIndex]);

  return (
    <div className="section page-main-side-padding w-full">
      <PageTitleTemplate redText="Us" blackText="Work With " reverse={true} />

      <div className="flex flex-col items-center justify-center xl:flex-row">
        <div className="text-center xl:relative xl:top-20 xl:mr-[3rem] xl:basis-[60%] xl:text-left">
          <PageSubtitleTemplate
            redText="Sponsor"
            blackText="Become a "
            reverse={true}
          />
          <p className="text-balance pb-10">
            Sponsors are imperative to DevDogs’ mission to bring perspectives
            together and build software with a purpose. Your generosity helps us
            provide an impactful software development experience for all.{" "}
          </p>
          <p className="text-balance">
            As a token of our appreciation, we are happy to provide a number of
            perks that you and your brand may enjoy. Learn more or make an
            inquiry today.
          </p>
        </div>

        {/* Image and Perk Card with Fade-in/Fade-out Animation */}
        <div className="relative mt-[4rem] h-[250px] w-[375px] rounded-t-[50px] md:self-center xl:mt-0 xl:basis-[40%]">
          <Image
            src={SponsorPerks[currentImageIndex].image}
            alt={SponsorPerks[currentImageIndex].name}
            fill={true}
            className={`absolute h-full w-full rounded-t-[50px] object-cover ${
              fadeType === "fadeIn" ? "animate-fadeIn" : "animate-fadeOut"
            }`}
          />
          <div
            className={`relative top-full h-[60px] rounded-b-[50px] bg-[#3A3A3A] ${
              fadeType === "fadeIn" ? "animate-fadeIn" : "animate-fadeOut"
            }`}
          >
            <p className="pt-3 text-center align-middle text-[1.3rem] text-white">
              {SponsorPerks[currentImageIndex].name}
            </p>
          </div>

          <Link
            href="/contact"
            className="absolute -bottom-[8.5rem] left-2 flex h-[4rem] w-[45%] items-center justify-center rounded-full bg-MidnightBlue text-white transition duration-300 ease-in-out hover:bg-[#1a1a26]"
          >
            <p>Contact Us</p>
          </Link>
          <Link
            href="/sponsor"
            className="absolute -bottom-[8.5rem] right-2 flex h-[4rem] w-[45%] items-center justify-center rounded-full bg-BulldogRed text-white transition duration-300 ease-in-out hover:bg-[#7e0820]"
          >
            <p>Sponsor</p>
          </Link>
        </div>
      </div>

      <div className="mt-[15rem] flex flex-col items-center px-2 text-center">
        <PageSubtitleTemplate
          redText="Campus Partner"
          blackText="Become a "
          reverse={true}
          className="text-center"
        />

        <div className="flex flex-col items-center justify-center xl:flex-row-reverse">
          <div className="text-center xl:relative xl:top-20 xl:ml-[3rem] xl:basis-[60%] xl:text-right">
            <p className="text-balance pb-10">
              Are you a department or club at UGA looking to funnel pathways
              into your program? So are we!
            </p>
            <p className="text-balance pb-10">
              DevDogs is always happy to partner with campus initiatives to
              provide members across tech disciplines pathways and opportunities
              to see success outside our club.
            </p>
            <p className="text-balance">
              As a partner, we will promote each other’s initiatives, respect
              our niches, and do what we can to support our causes. Send us a
              note with the form below, we can’t wait to work with you!
            </p>
          </div>

          <div className="relative mt-10 h-[250px] w-[375px] rounded-t-[50px] xl:mt-0 xl:basis-[40%]">
            <Image
              src={CampusPerks[currentImageIndex].image}
              alt={CampusPerks[currentImageIndex].name}
              fill={true}
              className={`absolute h-full w-full rounded-t-[50px] object-cover ${
                fadeType === "fadeIn" ? "animate-fadeIn" : "animate-fadeOut"
              }`}
            />
            <div
              className={`relative top-full h-[60px] rounded-b-[50px] bg-[#3A3A3A] ${
                fadeType === "fadeIn" ? "animate-fadeIn" : "animate-fadeOut"
              }`}
            >
              <p className="pt-3 text-center align-middle text-[1.3rem] text-white">
                {CampusPerks[currentImageIndex].name}
              </p>
            </div>

            <Link
              href="/contact"
              className="absolute -bottom-[8.5rem] left-1/2 flex h-[4rem] w-[45%] -translate-x-1/2 transform items-center justify-center rounded-full bg-MidnightBlue text-white transition duration-300 ease-in-out hover:bg-[#1a1a26]"
            >
              <p>Contact Us</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
