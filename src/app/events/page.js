import Footer from "../components/Footer";
import NavBar from "../components/NavBar";

const EventsPage = () => {
    return (
            <div class="section section-event">
                <div id="abouttitle">
                    <h1><b class="red-bold">Meetings</b> and <b class="red-bold">Events</b></h1>
                </div>

                <br />

                <div class="center">
                    <h1 class=" section-header">All students are welcome!</h1>
                    <br />
                    <p>Get an amazing experience and a glimpse into what working in the software development industry is like!</p>
                </div>

                <br />
                <br />
                
                <h1 >General Body <b class="dark_red-bold">Meetings</b></h1>

                
                <br />
                {/* <p>Every [INSERT DAY OF THE WEEK] from [INSERT START TIME] to [INSERT END TIME] at [INSERT LOCATION]</p> */}

                <p> Meeting details coming soon! </p>
                
                <br />
                <br />

                <h1> <b class="dark_red-bold">Upcoming </b>Events</h1>
                <br />
                <p><b>DevDogs: Ready, Steady, Launch! - TBD </b></p>
                <p>Join us to learn more about DevDogs, meet new people, and how you can get involved! </p>

                <br />
                <br />
                <br />

                
                <iframe id="iframe-test" src="https://embed.styledcalendar.com/#IvBYsu9dkaqY2qyAP7tR" title="Styled Calendar" class="styled-calendar-container" data-cy="calendar-embed-iframe"></iframe>
                <script async type="module" src="https://embed.styledcalendar.com/assets/parent-window.js"></script>
            </div>
            /* Old calender <iframe src="https://calendar.google.com/calendar/embed?src=en.usa%23holiday%40group.v.calendar.google.com&ctz=America%2FLos_Angeles"></iframe> */
    )
}

export default EventsPage;