import "./Home.css"
import Button from "./components/Button"
import logo from "./images/logo.png"
import demo from "./images/demo.png"
import background from "./images/background.png"
import mockup from "./images/mockup.png"
import Image from "next/image"
import Link from "next/link"

const Home = () => {
  return (
    <section id="base-background">
      
        <div class="section section-home">
        <div id="hometitle" className="grid">
          <div id="title">
            <h2 id="big">Hey UGA!</h2>
            <h1 id="big">We're <div class="red-bold">DevDogs</div>,</h1>
          </div>
          <Image id="mascot" src={logo} alt="DevDogs Logo" width="800" height="800"/>
        </div>
        <br/>
        <div className="grid">
          <Image id="demo" src={demo} alt="ACM OSP Demo" width="600" height="300"/>
          <div id="description">
            <h1>a team of</h1>
            <h1>passionate</h1>
            <h1 id="big" >Student</h1>
            <h1 id="big" class="dark_red-bold">Developers</h1>
            <h2>at UGA.</h2>  
          </div>      
        </div>
        <br/>
        <div className="grid">
          <div>
            <p class="section-header"><b><b class="dark_red-bold">We</b> develop some awesome software...</b></p>
            <p class="section-subheader">And we strive to better our community through code.</p>
            <p>Each year, we work hard to identify needs in Athens and solve them by taking solutions from concept to completion.</p>
          </div>
          <Image id="mockup" src={mockup} alt="ACM OSP Bus App Mockup" width="650" height="325"/>
        </div>
        <br />
        <br />
        <br />
        <h1 class="section-header-center">Sound interesting?</h1>
        <br />

        <div className="button-grid">
          <Link href="/about">
            <Button id="learnmore">Learn More</Button>
          </Link>
          <br/>
          <Link href="https://uga.campuslabs.com/engage/organization/devdogs">
            <Button id="joinus">Join Us!</Button>
          </Link>
        </div>
      </div>
    </section>

  )
}

export default Home;