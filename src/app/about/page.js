import NavBar from "../components/NavBar";
import Image from "next/image";
import demo from "../images/demo.png";
import mockup from "../images/mockup.png";
import Footer from "../components/Footer";
import name from "../images/mascotword.png"
const AboutPage = () => {
    return (
        <div>
            <NavBar />
            <div class="section section-about">
                <div id="abouttitle">
                    <h2 >System.out.println("Hello UGA!");</h2>
                    <h1><b id="devdawgs">DevDogs</b> @ UGA!</h1>
                </div>

                <br />

                <div className="grid" id="whoweare">
                    <Image id="name" src={name} alt="Mascot and DevDogs" />
                    <div>
                        <h1 class="dark_red-bold">Who We Are</h1>
                        <p>DevDogs is a student-run club at UGA dedicated to benefiting our community through code. Each year, we work together to develop impactful software from concept to completion, learning real-world skills and industry-standard tech along the way. </p>
                    </div>
                </div>

                <br />

                <div className="grid">

                    <div>
                        <h1 class="dark_red-bold">Our Mission</h1>
                        <p>Above all, we aim to provide a space for passionate student developers to take ownership of meaningful projects from concept to completion.</p>
                        <br />
                        <p>In the process, we hope to provide our members the local, personal, and technical tools necessary to incite change of their own, one project at a time.</p>
                    </div>
                    <Image id="mockup" src={mockup} alt="ACM OSP Mockup" width="300" height="200" />
                </div>

                <br />

                <div className="grid">
                    <Image id="demo" src={demo} alt="ACM OSP Demo" width="400" height="200" />
                    <div>
                        <h1 class="dark_red-bold">All students are welcome!</h1>
                        <p>Get an amazing experience and a glimpse into what working in the software development industry is like!</p>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    )
}

export default AboutPage;