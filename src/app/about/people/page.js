"use client";
import Card from "../../components/Card";
import anika from "../../images/officers/anika.jpg";
import jack from "../../images/officers/jack.jpg";
import kade from "../../images/officers/kade.jpg";
import kelsey from "../../images/officers/kelsey.jpg";
import sloan from "../../images/officers/sloan.jpg";
import devdog from "../../images/replaceddevdog.png";
import EmblaCarousel from "@/app/components/EmblaCarousel";
import Caoursel1 from "@/app/images/carousel4.jpg";
import Caoursel2 from "@/app/images/carousel5.jpg";
import Caoursel3 from "@/app/images/carousel6.jpg";
import LeaderBoard from "../../components/LeaderBoard";

const OurTeam = () => {
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
    <div className="section flex flex-col">
      <div className="my-[2rem] text-center">
        <h1 className="inline text-[3.5rem] font-bold text-MidnightBlue sm:text-[4.5rem]">
          Our{" "}
        </h1>
        <h1 className="inline text-[3.5rem] font-bold text-GloryGloryRed sm:text-[4.5rem]">
          People
        </h1>
      </div>
      <EmblaCarousel
        slides={imagesForCarousel}
        banner={false}
        options={OPTIONS}
      />

      <p className="page-main-side-padding pt-10 text-center text-[1.1rem] font-semibold md:text-[1.3rem] lg:text-[1.5rem]">
        DevDogs is proud to consist of over 350 UGA students from all tech
        disciplines and backgrounds. We firmly believe that different
        perspectives breed the best solutions--and we think our work shows! Take
        a look at some of the awesome people who have made DevDogs, DevDogs
        below.
      </p>

      <div className="page-main-side-padding text-center">
        <h3 className="mt-[5rem] p-0 text-center text-[2rem] font-extrabold text-black sm:text-[3rem]">
          {" "}
          2024 - 2025{" "}
        </h3>

        <h2 className="inline text-[2rem] font-bold text-BulldogRed md:text-[2.5rem] lg:text-[3rem]">
          Executive{" "}
        </h2>
        <h2 className="inline text-[2rem] font-bold text-MidnightBlue md:text-[2.5rem] lg:text-[3rem]">
          Board
        </h2>
      </div>

      <div id="teamtitle">
        <div id="grid">
          <Card
            name={"Kelsey"}
            title={"President"}
            image={kelsey}
            bgcolor="pink-light"
          />
          <Card
            name={"Kade"}
            title={"Vice President"}
            image={kade}
            bgcolor="pink-dark"
          />
          <Card
            name={"Anika"}
            title={"Membership and Analytics Chair"}
            image={anika}
            bgcolor="cyan-light"
          />
          <Card
            name={"Jack"}
            title={"Project Manager"}
            image={jack}
            bgcolor="brown-dark"
          />
          <Card
            name={"Sloan"}
            title={"Techical Chair"}
            image={sloan}
            bgcolor="pink"
          />
          <Card name={""} title={""} image={devdog} bgcolor="pink" />
        </div>
      </div>

      <div className="page-main-side-padding text-center">
        <h2 className="text- inline text-[2rem] font-bold md:text-[2.5rem] lg:text-[3rem]">
          Contributors
        </h2>

        <LeaderBoard />
      </div>
    </div>
  );
};

export default OurTeam;
