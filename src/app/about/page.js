import Image from "next/image"
import mockup from "../images/mockup.png";
import name from "../images/logo.png";
import Carousel from "../components/Carousel";

const AboutPage = () => {
    const images = ["https://www.fisheries.noaa.gov/s3//styles/original/s3/2023-06/750x500-Great-White-iStock.jpg?itok=RWsvCGC6", 
        "https://e3.365dm.com/24/03/1600x900/skynews-francois-langur-monkey_6488923.jpg?20240313102133",
        "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ftse1.mm.bing.net%2Fth%3Fid%3DOIP.92wIxwnq8FIO9oOg0KaF-QHaEo%26pid%3DApi&f=1&ipt=d37446fb31ea6cefd2805661d9077f514df2695379fdf8c18749d7a910a1718b&ipo=images"];

    return (
        <div>
            <div className="section section-about">
            <div id="abouttitle">
                <h1>About Us</h1>
            </div>

            <div className="grid">
                <div>
                    <h1 id="whoweare"> <b className="dark_red-bold">Who </b>We Are</h1>
                    <p>DevDogs is a student-run club at UGA dedicated to benefiting our community through code. Each year, we work together to develop impactful software from concept to completion, learning real-world skills and industry-standard tech along the way. </p>
                </div>
                <Image id="about-us-mascot" src={name} alt="DevDogs Mascot" />
            </div>

            <br />

            <div className="grid">
                <div>
                    <h1 id="whoweare">Our <b className="dark_red-bold">Mission</b></h1>
                    <p>Above all, we aim to provide a space for passionate student developers to take ownership of meaningful projects from concept to completion.</p>
                    <br />
                    <p>In the process, we hope to provide our members the local, personal, and technical tools necessary to incite change of their own, one project at a time.</p>
                </div>
                <Image id="mockup" src={mockup} alt="ACM OSP Mockup" width="650" height="325" />
            </div>

            <br />
            <br />
            <br />
            <Carousel images={images} />

            </div>
        </div>
    )
}

export default AboutPage;