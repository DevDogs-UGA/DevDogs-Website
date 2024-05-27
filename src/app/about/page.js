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
            <div class="section">
                <div id="abouttitle">
                    <h2 >System.out.println("Hello UGA!");</h2>
                    <h1>We are <b id="devdawgs">DevDogs</b>!</h1>
                </div>

                <br />

                <div className="grid">
                    <Image id="name" src={name} alt="Mascot and DevDogs" />
                    <div>
                        <h1 class="dark_red-bold">DevDogs</h1>
                        <p>is a student-run organization at the University of Georgia dedicated to encouraging a community of student developers and promoting interest in open-source project development.</p>
                    </div>
                </div>

                <br />

                <div className="grid">

                    <div>
                        <h1 class="dark_red-bold">Our mission</h1>
                        <p>is to present students with a platform to create technological innovations that help the Athens and UGA communities.</p>
                        <br />
                        <p>Students have the opportunity to learn various software development tools and languages while working with others for build meaningful creations.</p>
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