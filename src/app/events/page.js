import Footer from "../components/Footer";
import NavBar from "../components/NavBar";

const EventsPage = () => {
    return (
        <div>
            <NavBar />
            <div class="eventssection">
                <div id="eventstitle">
                    <h1><b class="red-bold">Meetings</b> and <b class="red-bold">Events</b></h1>
                </div>
                <h2 class="dark_red-bold">Meetings</h2>
                <br />
                <p>Every [INSERT DAY OF THE WEEK] from [INSERT START TIME] to [INSERT END TIME] at [INSERT LOCATION]</p>

                <br />

                <h2 class="dark_red-bold">Upcoming Events</h2>
                <br />
                <p><b>DevDogs Touch Grass! - [INSERT DATE AND TIME]</b></p>
                <p>Join us on the Myers Quad to learn more about DevDogs, meet new people, enjoy snacks and games, and touch some grass! </p>
                <iframe src="https://calendar.google.com/calendar/embed?src=en.usa%23holiday%40group.v.calendar.google.com&ctz=America%2FLos_Angeles"></iframe>
            </div>
            <Footer />
        </div>
    )
}

export default EventsPage;