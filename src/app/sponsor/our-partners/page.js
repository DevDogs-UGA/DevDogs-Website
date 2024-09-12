import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import Image from "next/image";
import GDC from "@/app/images/GDC.svg";
import KTP from "@/app/images/KTP.svg";
import CSCI from "@/app/images/CSCI.svg";
import SOE from "@/app/images/SOE.svg";
import ACM from "@/app/images/ACM.svg";

export default function page() {
  return (
    <div className="w-full gap-4 section flex flex-col h-[100vh] page-main-side-padding">
      <PageTitleTemplate
        redText="Partners"
        blackText="Campus "
        reverse="true"
      />
      <p className="text-center font-bold text-[1.8rem]">
        DevDogs is proud to be affiliated with
      </p>
      <div className="w-full flex justify-center">
        <Image
          src={GDC}
          alt="Google Developer Group"
          className="w-full max-w-[300px] sm:max-w-[400px] md:max-w-[500px] object-contain"
        />
      </div>
      <p className="text-center text-[1rem] sm:text-[1.5rem]">
        DevDogs&#39; meetings are co-branded as Google Developer Groups on
        Campus: UGA meetings, providing Google recognition to contributors,
        merchandise, and a network of incredible people just like you.
      </p>

      <div className="text-center text-[2rem] sm:text-[2.5rem]">
        <h2 className="font-[700] inline  text-BulldogRed">Campus </h2>
        <h2 className="font-[700] inline text-MidnightBlue">Afiliates</h2>
      </div>

      <div className="flex flex-wrap gap-4 justify-center w-full">
        <Image
          src={KTP}
          alt="KTP org"
          className="w-full max-w-[150px] sm:max-w-[200px] md:max-w-[250px] object-contain"
        />
        <Image
          src={CSCI}
          alt="CSCI epsilion"
          className="w-full max-w-[150px] sm:max-w-[200px] md:max-w-[250px] object-contain"
        />
        <Image
          src={ACM}
          alt="ACM at UGA"
          className="w-full max-w-[150px] sm:max-w-[200px] md:max-w-[250px] object-contain"
        />
        <Image
          src={SOE}
          alt="SOE"
          className="w-full max-w-[150px] sm:max-w-[200px] md:max-w-[250px] object-contain"
        />
      </div>
    </div>
  );
}
