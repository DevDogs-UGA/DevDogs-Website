import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import Image from "next/image";
import GDC from "@/app/images/GDC.svg";
import KTP from "@/app/images/KTP.svg";
import CSCI from "@/app/images/CSCI.svg";
import SOE from "@/app/images/SOE.svg";
import ACM from "@/app/images/ACM.svg";
import Temp from "@/app/images/tempProject.png";
import Link from "next/link";
import EmblaCarousel from "@/app/components/EmblaCarousel";

export default function page() {
  const OPTIONS = { loop: true };
  const imagesForCarousel = [
    {
      image: Temp,
      title: "Affiliate 1",
      description: "this is a sample sentence for the slide sentence.",
    },
    {
      image: Temp,
      title: "Affiliate 2",
      description: "this is a sample sentence for the slide sentence.",
    },
    {
      image: Temp,
      title: "Affiliate 3",
      description: "this is a sample sentence for the slide sentence.",
    },
    {
      image: Temp,
      title: "Affiliate 4",
      description: "this is a sample sentence for the slide sentence.",
    },
  ];
  return (
    <div className="w-full section">
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
        <h2 className="font-[700] inline text-MidnightBlue">Afiliates</h2>
      </div>
      <EmblaCarousel
        slides={imagesForCarousel}
        banner={true}
        options={OPTIONS}
      />

      <div className="mt-[6rem] flex flex-wrap gap-x-[4rem] gap-y-[2rem] items-center justify-center w-full page-main-side-padding">
        <Link
          target="_blank"
          href="https://www.linkedin.com/company/kappa-theta-pi-uga/"
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
          href="https://www.linkedin.com/company/kappa-theta-pi-uga/"
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
          href="https://www.linkedin.com/company/kappa-theta-pi-uga/"
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
          href="https://www.linkedin.com/company/kappa-theta-pi-uga/"
          className="w-full max-w-[150px] md:max-w-[200px]  object-contain"
        >
          <Image
            src={SOE}
            alt="SOE"
            className="w-full max-w-[150px] md:max-w-[200px] object-contain"
          />
        </Link>
      </div>
    </div>
  );
}
