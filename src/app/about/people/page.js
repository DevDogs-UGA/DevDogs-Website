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
import temp from "../../images/tempProject.png";

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

      <div className="page-main-side-padding text-center">
        <h2 className="inline text-[2rem] font-bold text-BulldogRed md:text-[2.5rem] lg:text-[3rem]">
          A
        </h2>
        <h2 className="inline text-[2rem] font-bold text-MidnightBlue md:text-[2.5rem] lg:text-[3rem]">
          -Team
        </h2>
      </div>

      <div id="ateamtitle">
        <div id="ateamgrid">
          <Card
            name={"Christine Le"}
            title={"Creative Director"}
            image={temp}
            bgcolor="brown-dark"
          />
          <Card
            name={"Reeyan Khimani"}
            title={"Web Developer"}
            image={temp}
            bgcolor="cyan-light"
          />
          <Card
            name={"Harshith Kethavath"}
            title={"Photographer"}
            image={temp}
            bgcolor="pink-light"
          />
          <Card
            name={"Tyler Meyer"}
            title={"Marketing Director"}
            image={temp}
            bgcolor="pink-dark"
          />
          <br />
        </div>
      </div>

      <div className="page-main-side-padding text-center">
        <h2 className="inline text-[2rem] font-bold text-BulldogRed md:text-[2.5rem] lg:text-[3rem]">
          Notable{" "}
        </h2>
        <h2 className="inline text-[2rem] font-bold text-MidnightBlue md:text-[2.5rem] lg:text-[3rem]">
          Help
        </h2>
      </div>

      <div id="teamtitle">
        <div id="grid">
          <Card
            name={"Helium Yang"}
            title={"Mentor"}
            image={temp}
            bgcolor="brown-dark"
          />
          <Card
            name={"Dr.Barnes"}
            title={"Facutly Advisor"}
            image={temp}
            bgcolor="cyan-light"
          />
          <Card
            name={"Dr. Cotterell"}
            title={"Faculty Advisor"}
            image={temp}
            bgcolor="pink-light"
          />
          <br />
        </div>
      </div>

      <div className="page-main-side-padding text-center">
        <h2 className="inline text-[2rem] font-bold text-MidnightBlue md:text-[2.5rem] lg:text-[3rem]">
          Focus Group{" "}
        </h2>
        <h2 className="inline text-[2rem] font-bold text-BulldogRed md:text-[2.5rem] lg:text-[3rem]">
          Leads
        </h2>
      </div>

      <div id="teamtitle">
        <div id="grid">
          <Card
            name={"Sophia"}
            title={"UI/UX Design"}
            image={temp}
            bgcolor="brown-dark"
          />
          <Card
            name={"Raghav"}
            title={"Backend/API"}
            image={temp}
            bgcolor="cyan-light"
          />
          <Card
            name={"Michael"}
            title={"Frontend Development"}
            image={temp}
            bgcolor="pink-light"
          />
          <Card
            name={"Aahil"}
            title={"Algorithm"}
            image={temp}
            bgcolor="pink-dark"
          />
          <Card
            name={"Cooper"}
            title={"Database"}
            image={temp}
            bgcolor="brown-light"
          />
          <Card
            name={"Jeffery"}
            title={"Webscraping"}
            image={temp}
            bgcolor="brown-light"
          />
          <br />
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
