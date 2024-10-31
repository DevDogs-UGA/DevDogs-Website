"use client";

import PageSubtitleTemplate from "@/app/components/PageSubtitleTemplate";
import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import Image from "next/image";
import Link from "next/link";
import PaymentTierCard from "@/app/components/PaymentTierCard";
import { useEffect, useState } from "react";

export default function Page() {
  const Photos = [
    { image: "/GroupPhoto1.jpg" },
    { image: "/GroupPhoto2.jpg" },
    { image: "/GroupPhoto3.jpg" },
    { image: "/GroupPhoto4.jpg" },
    { image: "/GroupPhoto5.jpg" },
    { image: "/GroupPhoto6.jpg" },
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % Photos.length);
    }, 10000); // Change image every 10 seconds

    return () => clearInterval(interval); // Cleanup interval on unmount
  }, []);
  const PaymentTiers = [
    {
      title: "Bronze - $600",
      image: "/ACMBackground.png",
      color: "#AD665C",
      link: "https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.BRONZE:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts",
    },
    {
      title: "Silver - $1250",
      image: "/ACMBackground.png",
      color: "#D8BCBC",
      link: "https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.BRONZE:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts",
    },
    {
      title: "Gold - $2500",
      image: "/ACMBackground.png",
      color: "#F9BD9B",
      link: "https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.GOLD:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts",
    },
    {
      title: "Platinum - $5000",
      image: "/ACMBackground.png",
      color: "#C6C6C6",
      link: "https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.PLATINUM:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts",
    },
    {
      title: "Custom Amount",
      image: "/ACMBackground.png",
      color: "#F08787",
      link: "https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.CUSTOM:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts",
    },
  ];

  return (
    <div className="section page-main-side-padding w-full">
      <PageTitleTemplate redText="Sponsor " blackText="Us" />
      <div className="flex flex-col items-center justify-center space-y-8 px-8 text-center xl:block xl:px-0">
        <div className="flex flex-col items-center justify-center xl:grid xl:grid-cols-2">
          <div className="xl:col-span-1 xl:justify-self-start xl:text-left">
            <div className="">
              <PageSubtitleTemplate
                redText="We Are"
                blackText="Who "
                reverse="true"
              />
              <p className="font-bold">
                DevDogs is a non-profit club at the University of Georgia
                dedicated to benefiting our community through code. Each year,
                we work together to develop impactful software from concept to
                completion, learning real-world skills and industry-standard
                tech along the way.
              </p>
            </div>
            <div className="mt-10">
              <PageSubtitleTemplate
                redText="Reaching"
                blackText="Who You're "
                reverse="true"
              />
              <p className="font-bold">
                Since its start in May 2024, DevDogs has grown its community to
                over 430 members. With our campus outreach campaigns, we’re
                pleased to have brought in a diverse set of perspectives and
                specialties including UI designers, database managers, project
                managers, and developers. While our members differ in ideas,
                age, and experience, we’re united by the cause of building
                software with a purpose.
              </p>
            </div>
          </div>
          <div className="mt-10 xl:justify-self-end">
            <Image
              className="xl:col-span-1"
              src="/Brochure.svg"
              width={300}
              height={1000}
              alt="Brochure"
            />
            <Link
              href="https://drive.google.com/file/d/1YjoK3LXnFSpgfiRmoGg3R9teDsCi1VAL/view?usp=sharing"
              target="_blank"
              className="my-5 flex items-center justify-center rounded-[183px] bg-BulldogRed px-5 py-2 text-white transition duration-500 ease-in-out hover:shadow-lg hover:shadow-BulldogRed/20"
            >
              <p>Download Brochure</p>
            </Link>
          </div>
        </div>

        <div className="space-y-8">
          <PageSubtitleTemplate redText="Why " blackText="We Need You" />{" "}
          <div className="xl:grid xl:grid-cols-2">
            <ul className="list-inside list-disc text-center text-[1.3rem] font-bold xl:col-span-1 xl:text-left">
              <li>
                <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                  Server space/computational resources
                </p>{" "}
                to host our projects
              </li>
              <li>
                <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                  Outreach software
                </p>{" "}
                for campaigns
              </li>
              <li>
                <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                  API fees
                </p>{" "}
                for projects
              </li>
              <li>
                <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                  Project management tools
                </p>{" "}
                for the Executive Board
              </li>
              <li>
                <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                  Feeding our members
                </p>{" "}
                at meetings
              </li>
              <li>
                <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                  Merchandise
                </p>{" "}
                to raise awareness and build community
              </li>
            </ul>
            <div className="mt-10 xl:col-span-1 xl:mt-0 xl:text-right">
              <p className="font-bold">
                Running a club is costly as-is, but UGA’s club expense
                restrictions are particularly challenging for technology clubs
                of our scale, which need more than $100 a year for equipment and
                SAAS payments.
              </p>
              <p className="mt-5 font-bold">
                As a result, we’re asking for your help. No matter how small or
                large, your contribution will go to great lengths helping us
                achieve our mission. As a token of our thanks, we’re happy to
                provide a number of benefits to you or your company, visible
                below.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center space-y-4">
          <PageSubtitleTemplate
            redText="Packages"
            blackText="Sponsor "
            reverse="true"
          />
          <Image
            className="xl:w-[100%]"
            src="/SponsorPackage.svg"
            width={700}
            height={650}
            alt="Sponsor Packages"
          />
        </div>

        <div className="mt-10">
          <div className="xl:grid xl:grid-cols-2">
            <div className="xl:col-span-1">
              {" "}
              <PageSubtitleTemplate
                redText="Addons"
                blackText="Packages "
                reverse="true"
                className="text-center xl:text-left"
              />
              <ul className="list-inside list-disc text-center text-[1.3rem] font-bold xl:text-left">
                <li>
                  <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                    Sponsor DevDogs Academy
                  </p>{" "}
                  for the school year - $1000
                </li>
                <li>
                  <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                    Extra Workshop
                  </p>{" "}
                  - $750
                </li>
                <li>
                  <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                    Extra Recruitment Session
                  </p>{" "}
                  - $500
                </li>
                <li>
                  <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                    Extra Dev Session Sponsorship
                  </p>{" "}
                  - $400
                </li>
                <li>
                  <p className="inline text-[1.3rem] font-bold text-[#00A3AD]">
                    Extra Social Media Mention
                  </p>{" "}
                  - $100
                </li>
              </ul>
            </div>
            <div className="mt-10 flex flex-row items-center justify-center xl:col-span-1 xl:mt-0">
              <Image
                src={Photos[currentImageIndex].image}
                width={500}
                height={500}
                className="animate-fadeInOut rounded-[50px]"
              />
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between xl:flex-row">
            <p className="mb-3 text-[1.75rem] font-bold text-DevDogBlue xl:mb-0 xl:text-left">
              Don’t see something that works for you?
            </p>
            <Link
              href="/contact"
              className="flex items-center justify-center rounded-[183px] bg-BulldogRed px-5 py-2 text-white transition duration-500 ease-in-out hover:shadow-lg hover:shadow-BulldogRed/20 xl:mr-[20rem]"
            >
              <p>Contact Us</p>
            </Link>
          </div>
        </div>
        <div className="mt-10">
          <PageSubtitleTemplate
            redText="Teir"
            blackText="Select Your "
            reverse="true"
          />
          <div className="flex flex-wrap items-center justify-center gap-2 transition-all duration-300 ease-in-out">
            {PaymentTiers.map((tier) => (
              <PaymentTierCard
                key={tier}
                title={tier.title}
                // image={tier.image}
                link={tier.link}
                color={tier.color}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
