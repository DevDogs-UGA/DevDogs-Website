import Image from "next/image"
import mockup from "../images/mockup.png";
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
                    <div className="flex flex-nowrap items-center justify-center ">
                        <Link className="bg-NavBarColor rounded-full text-white mr-4 py-3 px-6 transition ease-in-out duration-200 hover:bg-black" target="_blank" href="https://discord.com/invite/MuyJ4f5xKE">
                            <Button >All Projects</Button>
                        </Link>
                        <br />
                        <Link className="bg-UGA rounded-full text-white ml-4 py-3 px-6 transition ease-in-out duration-200 hover:bg-black" href="\our-team">
                            <Button >Our People</Button>
                        </Link>   
                    </div>
                </div>
            </div>
        </div>
    )
}

export default AboutPage;