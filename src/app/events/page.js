import Footer from "../components/Footer";
import NavBar from "../components/NavBar";

const EventsPage = () => {
    return (
            <div class="section section-event">
                <div id="eventstitle">
                    <h1><b class="red-bold">Join Us</b></h1>
                </div>

                <div class="center">
                    <h1 class=" section-header"> <b class="red-bold">All students are welcome!</b></h1>
                    <p>Get an amazing experience and a glimpse into what working in the software development industry is like!</p>
                </div>

                <br />
                <br />
                <br />
                
                <h1 class="section-header center"><b class="red-bold">Meetings</b> and <b class="red-bold">Events</b></h1>

                <h1 class="dark_red-bold">Meetings</h1>
                <br />
                {/* <p>Every [INSERT DAY OF THE WEEK] from [INSERT START TIME] to [INSERT END TIME] at [INSERT LOCATION]</p> */}

                <p> Meeting details coming soon! </p>
                
                <br />

                <h1 class="dark_red-bold">Upcoming Events</h1>
                <br />
                <p><b>DevDogs: Ready, Steady, Launch! - TBD </b></p>
                <p>Join us to learn more about DevDogs, meet new people, and how you can get involved! </p>

                <br />
                <br />

                <iframe src="https://calendar.google.com/calendar/embed?src=en.usa%23holiday%40group.v.calendar.google.com&ctz=America%2FLos_Angeles"></iframe>
            </div>
    )
}

export default EventsPage;