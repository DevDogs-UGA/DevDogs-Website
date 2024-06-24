import Image from "next/image"
import demo from "../images/demo.png"
import mockup from "../images/mockup.png"
import name from "../images/mascotword.png"

/*
Below imports are for Leadership temp trial
*/
import Card from "../components/Card"

import nn from "../images/officers/nn.jpg"
import ks from "../images/officers/ks.jpg"
import jb from "../images/officers/jb.jpg"
import am from "../images/officers/am.jpg"
import bm from "../images/officers/bm.jpg"
import kds from "../images/officers/kds.jpg"

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

                <br />
                <br />
                <br />
                
                <div id="leadership">
                    <h1 class="center">Leadership</h1>
                </div>

                <div>
                    <div id="grid" class="center">
                        <Card name={'Justin Brand'} title={'President'} image={jb} bgcolor="brown-dark"/>
                        <Card name={'Nivedha Natarajan'} title={'Technical Officer'} image={nn} bgcolor="cyan-light"/>
                        <Card name={'Kelsey Sterner'} title={'Community Relations Officer'} image={ks} bgcolor="pink-light"/>
                        <Card name={'Avery Marco'} title={'Instructional Officer'} image={am} bgcolor="pink"/>
                        <Card name={'Kade Styron'} title={'Corporate & Career Officer'} image={kds} bgcolor="pink-dark"/>
                        <Card name={'Bryant Monahan'} title={'Campus Initiatives Officer'} image={bm} bgcolor="brown-light"/>
                    </div>
                    <p id="team-bottom-padding"></p>
                    <br />
                </div>
            </div>
           
    )
}

export default AboutPage;