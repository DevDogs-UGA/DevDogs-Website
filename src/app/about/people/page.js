"use client";
import Card from "../../components/Card";
import nn from "../../images/officers/nn.jpg";
import ks from "../../images/officers/ks.jpg";
import jb from "../../images/officers/jb.jpg";
import am from "../../images/officers/am.jpg";
import bm from "../../images/officers/bm.jpg";
import kds from "../../images/officers/kds.jpg";
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
      <div className="text-center my-[2rem]">
        <h1 className="font-bold text-[3.5rem] sm:text-[4.5rem] inline text-MidnightBlue">
          Our{" "}
        </h1>
        <h1 className="text-GloryGloryRed font-bold text-[3.5rem] sm:text-[4.5rem] inline">
          People
        </h1>
      </div>
      <EmblaCarousel
        slides={imagesForCarousel}
        banner={false}
        options={OPTIONS}
      />

      <p className="text-center pt-10 page-main-side-padding font-semibold text-[1.1rem] md:text-[1.3rem] lg:text-[1.5rem]">
        DevDogs is proud to consist of over 350 UGA students from all tech
        disciplines and backgrounds. We firmly believe that different
        perspectives breed the best solutions--and we think our work shows! Take
        a look at some of the awesome people who have made DevDogs, DevDogs
        below.
      </p>

      <div className="text-center page-main-side-padding">
        <h3 className="text-black text-[2rem] sm:text-[3rem]  text-center mt-[5rem] p-0 font-extrabold">
          {" "}
          2024 - 2025{" "}
        </h3>

        <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-BulldogRed">
          Executive{" "}
        </h2>
        <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-MidnightBlue">
          Board
        </h2>
      </div>

      <div id="teamtitle">
        <div id="grid">
          <Card
            name={"Justin Brand"}
            title={"President"}
            image={jb}
            bgcolor="brown-dark"
          />
          <Card
            name={"Nivedha Natarajan"}
            title={"Technical Officer"}
            image={nn}
            bgcolor="cyan-light"
          />
          <Card
            name={"Kelsey Sterner"}
            title={"Engagement Officer"}
            image={ks}
            bgcolor="pink-light"
          />
          <Card
            name={"Avery Marco"}
            title={"Instructional Officer"}
            image={am}
            bgcolor="pink"
          />
          <Card
            name={"Kade Styron"}
            title={"Corporate & Career Officer"}
            image={kds}
            bgcolor="pink-dark"
          />
          <Card
            name={"Bryant Monahan"}
            title={"Campus Initiatives Officer"}
            image={bm}
            bgcolor="brown-light"
          />
          <br />
        </div>
      </div>

      <div className="text-center page-main-side-padding">
        <h2 className="font-bold inline text-[2rem] md:text-[2.5rem] lg:text-[3rem] text-">
          Contributors
        </h2>

        <LeaderBoard />
      </div>
    </div>
  );
};

export default OurTeam;
