import Image from "next/image"
import demo from "../images/demo.png"
import mockup from "../images/mockup.png"
import name from "../images/mascotword.png"

const AboutPage = () => {
    return (
    
            <div class="section section-about">
                <div id="abouttitle">
                    <h1 >About Us</h1>
                    <h1><b id="devdawgs">DevDogs</b> @ <b id="devdawgs">UGA</b> ! </h1>
                </div>

                <br />

                <div className="grid" id="whoweare">
                    
                    <div>
                        <h1 class="dark_red-bold">Who We Are</h1>
                        <p>DevDogs is a student-run club at UGA dedicated to benefiting our community through code. Each year, we work together to develop impactful software from concept to completion, learning real-world skills and industry-standard tech along the way. </p>
                    </div>
                    <Image id="name" src={name} alt="Mascot and DevDogs" />
                </div>

                <br />

                <div className="grid">

                    <div>
                        <h1 class="dark_red-bold">Our Mission</h1>
                        <p>Above all, we aim to provide a space for passionate student developers to take ownership of meaningful projects from concept to completion.</p>
                        <br />
                        <p>In the process, we hope to provide our members the local, personal, and technical tools necessary to incite change of their own, one project at a time.</p>
                    </div>
                    <Image id="mockup" src={mockup} alt="ACM OSP Mockup" width="650" height="325" />
                </div>
            </div>
           
    )
}

export default AboutPage;