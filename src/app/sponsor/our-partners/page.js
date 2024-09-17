import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import Image from "next/image";
import GDC from "@/app/images/GDC.svg";
import GDCBg from "@/app/images/GDCBackground.png";
import KTPBg from "@/app/images/KTPBackground.png";
import ACMBg from "@/app/images/ACMBackground.png";
import EPIBg from "@/app/images/EpiBackground.png";
import SOEBg from "@/app/images/SOEBackground.png";
import UGAHacks from "@/app/images/UGAHacks.png";
import EmblaCarousel from "@/app/components/EmblaCarousel";

export default function page() {
  const OPTIONS = { loop: true };
  const imagesForCarousel = [
    {
      image: GDCBg,
      title: "Google Developer Groups on Campus: UGA",
      description:
        "GDGC UGA co-hosts their meetings with DevDogs, getting you in the Google sphere.",
      link: "https://gdg.community.dev/",
    },
    {
      image: KTPBg,
      title: "Kappa Theta Pi: Phi Colony",
      description:
        "KTP is UGA's first technology frat, developing the next generation of industry professionals",
      link: "https://ktpgeorgia.com/",
    },
    {
      image: ACMBg,
      title: "ACM @ UGA",
      description:
        "Every week, ACM hosts workshops discussing the latest technologies.",
      link: "https://acm-uga.github.io/",
    },
    {
      image: EPIBg,
      title: "Computer Science Career Initiative",
      description:
        "CSCI provides resources to assist students in their pursuit of a many technical fields.",
      link: "https://uga.campuslabs.com/engage/organization/csci",
    },
    {
      image: SOEBg,
      title: "Society of Entrepreneurs",
      description:
        "Learn from and connect with founders and business-savvy individuals at SOE's many events.",
      link: "https://www.soeuga.com/",
    },
    {
      image: UGAHacks,
      title: "UGA Hacks",
      description:
        "Every spring, UGA Hacks puts on a 3-day, 800+ person hackathon at MLC.",
      link: "https://ugahacks.com/",
    },
  ];
  return (
    <div className="w-full section ">
      <PageTitleTemplate
        redText="Partners"
        blackText="Campus "
        reverse="true"
      />
      <p className="text-center font-bold text-[1.8rem]">
        DevDogs is proud to be affiliated with
      </p>
      <div className="w-full flex justify-center page-main-side-padding mt-[2rem]">
        <Image
          src={GDC}
          alt="Google Developer Group"
          className="w-full max-w-[400px] sm:max-w-[500px] md:max-w-[800px] object-contain"
        />
      </div>
      <p className="text-center text-[1rem] sm:text-[1.5rem] page-main-side-padding mt-[4rem]">
        DevDogs&#39; meetings are co-branded as Google Developer Groups on
        Campus: UGA meetings, providing Google recognition to contributors,
        merchandise, and a network of incredible people just like you.
      </p>

      <div className="text-center text-[2rem] sm:text-[2.5rem] mt-[4rem]">
        <h2 className="font-[700] inline  text-BulldogRed">Campus </h2>
        <h2 className="font-[700] inline text-MidnightBlue">Affiliates</h2>
      </div>
      <EmblaCarousel
        slides={imagesForCarousel}
        banner={true}
        options={OPTIONS}
      />

      {/* <div className="mt-[6rem] flex flex-wrap gap-x-[4rem] gap-y-[2rem] items-center justify-center w-full page-main-side-padding pt-[10rem]">
        <Link
          target="_blank"
          href="https://ktpgeorgia.com/"
          className="w-full max-w-[150px] md::max-w-[200px]  object-contain"
        >
          <Image
            src={KTP}
            alt="KTP org"
            className="w-full max-w-[150px] md::max-w-[200px] object-contain"
          />
        </Link>
        <Link
          target="_blank"
          href="https://uga.campuslabs.com/engage/organization/csci"
          className="w-full max-w-[150px] md:max-w-[200px]  object-contain"
        >
          <Image
            src={CSCI}
            alt="CSCI epsilion"
            className="w-full max-w-[150px] md:max-w-[200px]  object-contain"
          />
        </Link>
        <Link
          target="_blank"
          href="https://acm-uga.github.io/"
          className="w-full max-w-[150px] md:max-w-[200px]  object-contain"
        >
          <Image
            src={ACM}
            alt="ACM at UGA"
            className="w-full max-w-[150px] md:max-w-[200px]  object-contain"
          />
        </Link>
        <Link
          target="_blank"
          href="https://www.soeuga.com/"
          className="w-full max-w-[150px] md:max-w-[200px]  object-contain"
        >
          <Image
            src={SOE}
            alt="SOE"
            className="w-full max-w-[150px] md:max-w-[200px] object-contain"
          />
        </Link>
      </div> */}
    </div>
  );
}
