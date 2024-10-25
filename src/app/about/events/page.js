const EventsPage = () => {
  return (
    <div className="section section-event page-main-side-padding">
      <div className="my-[125px] text-center">
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

      <div className="text-center">
        <h1 className="text-[2.5rem] font-semibold text-MidnightBlue">
          All students are welcome!
        </h1>

        <p className="mx-[10%]">
          Get an amazing experience and a glimpse into what working in the
          software development industry is like!
        </p>
      </div>

      <h1 className="md:[2.5rem] mt-8 text-[2rem] font-bold text-MidnightBlue">
        General Body{" "}
        <p className="md:[2.5rem] inline text-[2rem] font-bold text-BulldogRed">
          Meetings
        </p>
      </h1>

      <p>Monday August 26th, 2024 from 5:30 PM to 6:30PM in MLC 150</p>
      <p>Monday September 9th, 2024 from 5:30 PM to 6:30PM in MLC 150</p>

      <h1 className="md:[2.5rem] mt-8 text-[2rem] font-bold text-MidnightBlue">
        Dev{" "}
        <p className="md:[2.5rem] inline text-[2rem] font-bold text-BulldogRed">
          Sessions
        </p>
      </h1>

      <p>Every Monday from 5:30 PM to 6:30PM in (New) Poultry Science 125*</p>
      <p>
        <i>*Begins on September 16th, 2024</i>
      </p>

      <h1 className="md:[2.5rem] mt-8 text-[2rem] font-bold text-MidnightBlue sm:text-[2rem]">
        Upcoming{" "}
        <p className="md:[2.5rem] inline text-[2rem] font-bold text-BulldogRed sm:text-[2rem]">
          Meetings
        </p>
      </h1>

      <p>
        <b>DevDogs: Ready, Steady, Launch! - August 26th, 2024 </b>
      </p>
      <p>
        Join us to learn more about DevDogs, meet new people, and how you can
        get involved!
      </p>

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
