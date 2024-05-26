import NavBar from "../components/NavBar";
import logo from "../images/logo.png";
import demo from "../images/demo.png";
import mockup from "../images/mockup.png";
import Footer from "../components/Footer";

const AboutPage = () => {
    return (
        <div>
            <NavBar />
            <div class="section">
                <div id="abouttitle">
                    <h3 >System.out.println("Hello UGA!");</h3>
                    <h1>We are <b id="devdawgs">DevDogs</b>!</h1>
                </div>

                <br />

                <div className="grid">
                    <img src={demo} alt="ACM OSP Demo" />
                    <div>
                        <h2 class="dark_red-bold">DevDogs</h2>
                        <p>is a student-run organization at the University of Georgia dedicated to encouraging a community of student developers and promoting interest in open-source project development.</p>
                    </div>
                </div>

                <br />

                <div className="grid">

                    <div>
                        <h2 class="dark_red-bold">Our mission</h2>
                        <p>is to present students with a platform to create technological innovations that help the Athens and UGA communities.</p>
                        <br />
                        <p>Students have the opportunity to learn various software development tools and languages while working with others for build meaningful creations.</p>
                    </div>
                    <img src={demo} alt="ACM OSP Demo" />
                </div>

                <br />

                <div className="grid">
                    <img src={demo} alt="ACM OSP Demo" />
                    <div>
                        <h2 class="dark_red-bold">All students are welcome!</h2>
                        <p>Get an amazing experience and a glimpse into what working in the software development industry is like!</p>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    )
}

export default AboutPage;