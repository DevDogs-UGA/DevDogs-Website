import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import Link from "next/link";
import EmblaCarousel from "@/app/components/EmblaCarousel";
import Caoursel1 from "@/app/images/carousel1.png";
import Caoursel2 from "@/app/images/carousel2.jpg";
import Caoursel3 from "@/app/images/carousel3.jpg";

const EventsPage = () => {
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
    <div className="section section-event page-main-side-padding">
      <div className="text-center my-[125px]">
        <h2 className=" font-bold text-[3.5rem] sm:text-[4.5rem] md:[5.5rem] text-GloryGloryRed inline">
          Meetings{" "}
        </h2>
        <h2 className="font-bold text-[3.5rem] sm:text-[4.5rem]  inline text-MidnightBlue">
          &
        </h2>
        <h2 className="font-bold text-[3.5rem] sm:text-[4.5rem] text-GloryGloryRed inline">
          {" "}
          Events
        </h2>
      </div>

      <div className="flex gap-6 pb-10 items-center px-4">
        <div className="text-left">
          <h2 className="font-bold inline text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] text-MidnightBlue">
            General Body Meetings (
          </h2>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] text-BulldogRed">
            GBM
          </h2>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] text-MidnightBlue">
            s)
          </h2>
          <p className="text-[1rem] sm:text-[1.3rem] md:text-[1.5rem] ">
            Key information meetings for DevDogs. Attendees will have the
            opportunity to meet other members, learn about the club, and learn
            about our software project this year. All are welcome and no RSVP is
            required.
          </p>
        </div>
        <div className="text-right ">
          <h2 className="font-bold inline text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] text-BulldogRed">
            Dev{" "}
          </h2>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] text-MidnightBlue">
            Sessions
          </h2>
          <p className="text-[1rem] sm:text-[1.3rem] md:text-[1.5rem]">
            Collaborative project development sessions for DevDogs. The primary
            meeting type. Attendees will discuss the progress of our project,
            discuss next steps, and tackle development problems together
            in-person. All are welcome and no RSVP is required.
          </p>
        </div>
      </div>

      <p className="text-center py-2 text-[1rem] sm:text-[1.3rem] md:text-[1.5rem] px-4">
        The latest dates and times can be found in the calendar below. Members
        are welcome to attend our livestreams on{" "}
        <Link href="tps://discord.com/invite/MuyJ4f5xKE" target="_blank">
          Discord
        </Link>{" "}
        if they cannot attend in-person.
      </p>

      <div className="py-10 text-center">
        <h2 className="font-bold inline text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] text-BulldogRed">
          Special{" "}
        </h2>
        <h2 className="font-bold inline text-[2.5rem] md:text-[3rem] lg:text-[3.5rem] text-MidnightBlue">
          Events
        </h2>

        <EmblaCarousel
          slides={imagesForCarousel}
          banner={false}
          options={OPTIONS}
        />
      </div>

      <div>
        <iframe
          id="iframe-test"
          src="https://embed.styledcalendar.com/#IvBYsu9dkaqY2qyAP7tR"
          title="Styled Calendar"
          className="styled-calendar-container mt-8"
          data-cy="calendar-embed-iframe"
        ></iframe>
        <script
          async
          type="module"
          src="https://embed.styledcalendar.com/assets/parent-window.js"
        ></script>
      </div>
    </div>
  );
};

export default EventsPage;
