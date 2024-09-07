const EventsPage = () => {
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
          {" "}Events
        </h2>
      </div>

      <div className="text-center">
        <h1 className="font-semibold text-[2.5rem] text-MidnightBlue">
          All students are welcome!
        </h1>

        <p className="mx-[10%]">
          Get an amazing experience and a glimpse into what working in the
          software development industry is like!
        </p>
      </div>

      <h1 className="font-bold text-[2rem] md:[2.5rem] mt-8 text-MidnightBlue">
        General Body{" "}
        <p className="font-bold text-[2rem] md:[2.5rem] inline text-BulldogRed">
          Meetings
        </p>
      </h1>

      <p>Monday August 26th, 2024 from 5:30 PM to 6:30PM at MLC 150</p>
      <p>Monday September 9th, 2024 from 5:30 PM to 6:30PM at MLC 150</p>

      <h1 className="font-bold text-[2rem] md:[2.5rem] mt-8 text-MidnightBlue">
        
        Dev{" "}
        <p className="font-bold text-[2rem] md:[2.5rem] inline text-BulldogRed">
          Sessions
        </p>
      </h1>

      <p>Every Monday from 5:30 PM to 6:30PM at Boyd 222*</p>
      <p>
        <i>*Begins on September 16th, 2024</i>
      </p>

      <h1 className="font-bold text-[2rem] sm:text-[2rem] md:[2.5rem] mt-8 text-MidnightBlue">
        
        Upcoming{" "}
        <p className="font-bold text-[2rem] sm:text-[2rem] md:[2.5rem] inline text-BulldogRed">
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
