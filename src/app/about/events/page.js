const EventsPage = () => {
  return (
    <div className="section section-event page-main-side-padding">
      <div id="eventtitle">
        <b className="red-bold">Meetings</b> and{" "}
        <b className="red-bold">Events</b>
      </div>

      <br />

      <div className="center">
        <h1 className=" section-header">All students are welcome!</h1>
        <br />
        <p>
          Get an amazing experience and a glimpse into what working in the
          software development industry is like!
        </p>
      </div>

      <br />
      <br />

      <h1 className="font-bold text-[1rem] sm:text-[2rem] md:[2.5rem]">
        {" "}
        Welcome General Body <b className="dark_red-bold">Meetings</b>
      </h1>

      <br />
      <p>Monday August 26th, 2024 from 5:30 PM to 6:30PM at Boyd 328</p>
      <p>Monday September 9th, 2024 from 5:30 PM to 6:30PM at Boyd 328</p>

      <br />

      <h1 className="font-bold text-[1rem] sm:text-[2rem] md:[2.5rem]">
        Dev <b className="dark_red-bold">Sessions</b>
      </h1>

      <br />

      <p>Every Monday from 5:30 PM to 6:30PM at Boyd 222*</p>
      <p>
        <i>*Begins on September 16th, 2024</i>
      </p>

      <br />
      <br />

      <h1 className="font-bold text-[1rem] sm:text-[2rem] md:[2.5rem]">
        {" "}
        <b className="dark_red-bold">Upcoming </b>Events
      </h1>

      <br />

      <p>
        <b>DevDogs: Ready, Steady, Launch! - August 26th, 2024 </b>
      </p>
      <p>
        Join us to learn more about DevDogs, meet new people, and how you can
        get involved!{" "}
      </p>

      <br />
      <br />
      <br />

      <iframe
        id="iframe-test"
        src="https://embed.styledcalendar.com/#IvBYsu9dkaqY2qyAP7tR"
        title="Styled Calendar"
        className="styled-calendar-container"
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
