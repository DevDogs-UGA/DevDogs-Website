import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import Link from "next/link";
import Image from "next/image";
import EmblaCarousel from "@/app/components/EmblaCarousel";

const EventsPage = () => {
  const OPTIONS = { loop: true };
  const imagesForCarousel = [
    {
      image: "/Events0.jpg",
    },
    {
      image: "/Events1.jpg",
    },
    {
      image: "/Events2.jpg",
    },
    {
      image: "/Events3.jpg",
    },
    {
      image: "/Events4.jpg",
    },
    {
      image: "/Events5.jpg",
    },
  ];

  return (
    <div className="section section-event page-main-side-padding">
      <div className="my-[125px] text-center leading-[3rem] sm:leading-[3.5rem]">
        <h2 className="md:[5.5rem] inline text-[3.5rem] font-bold text-GloryGloryRed sm:text-[4.5rem]">
          Meetings{" "}
        </h2>
        <h2 className="inline text-[3.5rem] font-bold text-MidnightBlue sm:text-[4.5rem]">
          &
        </h2>
        <h2 className="inline text-[3.5rem] font-bold text-GloryGloryRed sm:text-[4.5rem]">
          {" "}
          Events
        </h2>
      </div>

      <div className="flex items-center gap-6 px-4 pb-10">
        <div className="text-left">
          <h2 className="inline text-[2.5rem] font-bold leading-[2.8rem] text-MidnightBlue sm:leading-[3.5rem] md:text-[3rem] lg:text-[3.5rem]">
            General Body Meetings (
          </h2>
          <h2 className="inline text-[2.5rem] font-bold leading-[2.8rem] text-BulldogRed sm:leading-[3.5rem] md:text-[3rem] lg:text-[3.5rem]">
            GBM
          </h2>
          <h2 className="inline text-[2.5rem] font-bold leading-[2.8rem] text-MidnightBlue sm:leading-[3.5rem] md:text-[3rem] lg:text-[3.5rem]">
            s)
          </h2>
          <p className="text-[1rem] sm:text-[1.3rem] md:text-[1.5rem]">
            Key information meetings for DevDogs. Attendees will have the
            opportunity to meet other members, learn about the club, and learn
            about our software project this year. All are welcome and no RSVP is
            required.
          </p>
        </div>
        <div className="text-right">
          <h2 className="inline text-[2.5rem] font-bold leading-[2.8rem] text-BulldogRed sm:leading-[3.3rem] md:text-[3rem] lg:text-[3.5rem]">
            Dev{" "}
          </h2>
          <h2 className="inline text-[2.5rem] font-bold leading-[2.8rem] text-MidnightBlue sm:leading-[3.3rem] md:text-[3rem] lg:text-[3.5rem]">
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

      <p className="px-4 py-2 text-center text-[1rem] sm:text-[1.3rem] md:text-[1.5rem]">
        The latest dates and times can be found in the calendar below. Members
        are welcome to attend our livestreams on{" "}
        <Link
          href="tps://discord.com/invite/MuyJ4f5xKE"
          target="_blank"
          className="font-bold text-[#9656CE] transition duration-200 ease-in-out hover:text-[#5b209a]"
        >
          Discord
        </Link>{" "}
        if they cannot attend in-person.
      </p>

      <div className="py-10 text-center">
        <h2 className="inline text-[2.5rem] font-bold text-BulldogRed md:text-[3rem] lg:text-[3.5rem]">
          Special{" "}
        </h2>
        <h2 className="inline text-[2.5rem] font-bold text-MidnightBlue md:text-[3rem] lg:text-[3.5rem]">
          Events
        </h2>

        <EmblaCarousel
          slides={imagesForCarousel}
          banner={false}
          options={OPTIONS}
        />
      </div>

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
  );
};

export default EventsPage;
