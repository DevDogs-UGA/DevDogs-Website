import Image from "next/image"
import mockup from "../images/mockup.png"
import demo from "../images/demo.png"

const AboutPage = () => {
    return (
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
        </div>
    )
}

export default AboutPage;