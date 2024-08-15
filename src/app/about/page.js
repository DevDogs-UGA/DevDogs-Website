import Image from "next/image"
import mockup from "../images/mockup.png";
import name from "../images/logo.png";
import Carousel from "../components/Carousel";
import demo from "../images/demo.png"
import Button from "../components/Button"
import Link from "next/link"

//import image1 from "/carousel/carousel1.png"
//import image2 from "../images/carousel/carousel2.jpg"
//import image3 from "../images/carousel/carousel3.jpg"

// The link for the "All Projects" button goes to the discord because there is not a projects page yet. 
// The link for the "Our People" buttongoes to the Team page until the our People page is complete.

const AboutPage = () => {
    const imagess = ["https://www.fisheries.noaa.gov/s3//styles/original/s3/2023-06/750x500-Great-White-iStock.jpg?itok=RWsvCGC6", 
        "https://e3.365dm.com/24/03/1600x900/skynews-francois-langur-monkey_6488923.jpg?20240313102133",
        "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ftse1.mm.bing.net%2Fth%3Fid%3DOIP.92wIxwnq8FIO9oOg0KaF-QHaEo%26pid%3DApi&f=1&ipt=d37446fb31ea6cefd2805661d9077f514df2695379fdf8c18749d7a910a1718b&ipo=images"];

    const images = ['/carousel/carousel1.png', '/carousel/carousel2.jpg', '/carousel/carousel3.jpg'];

    return (
        <div>
            <div className="section section-about">
                <div id="abouttitle">
                    <h1>More <b className="dark_red-bold">About Us</b></h1>
                </div>

                <div className="grid">
                    <div>
                        <h1 id="whoweare"> <b className="dark_red-bold">Who </b>We Are</h1>
                        <p>DevDogs is a student-run club at UGA dedicated to benefiting our community through code. Each year, we work together to develop impactful software from concept to completion, learning real-world skills and industry-standard tech along the way. </p>
                    </div>
                    <Image id="demo" src={demo} alt="ACM OSP Demo" />
                </div>

                <br />

                <div className="grid">
                    <div>
                        <h1 id="whoweare">Our <b className="dark_red-bold">Mission</b></h1>
                        <p>Above all, we aim to provide a space for passionate students from all disciplines to take ownership of meaningful software projects.</p>
                        <br />
                        <p>In the process, we hope to build a network of awesome people, refine skills for our career, and learn how to incite change of our own, one project at a time.</p>
                    </div>
                    <Image id="mockup" src={mockup} alt="ACM OSP Mockup" width="650" height="325" />
                </div>

                <br />
                <br />
                <br />

                <div className="impact-section">
                    <h1 id="impact">Our <b className="dark_red-bold">Impact</b></h1>
                    <br />
                    <Carousel images={images} />
                    <br />
                    <br />
                    <h1 id="impact">More Info</h1>
                    <br />
                    <div className="button-grid">
                        <Link href="https://discord.com/invite/MuyJ4f5xKE">
                            <Button id="all-projects">All Projects</Button>
                        </Link>
                        <br />
                        <Link href="\our-team">
                            <Button id="our-people">Our People</Button>
                        </Link>   
                    </div>
                </div>
            
            </div>
           
        </div>
    )
}

export default AboutPage;