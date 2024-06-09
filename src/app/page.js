import "./Home.css"
import Button from "./components/Button";
import Footer from "./components/Footer";
import NavBar from "./components/NavBar";
import logo from "./images/logo.png";
import demo from "./images/demo.png";
import mockup from "./images/mockup.png";
import Image from "next/image";
import Link from "next/link";

const Home = () => {
  return (
    <div>
      <NavBar />
        <div class="section">
        <div id="hometitle" className="grid">
          <div id="title">
            <h2 id="big">Hello, UGA;</h2>
            <h1 id="big">We are <div class="red-bold">DevDogs</div>,</h1>
          </div>
          <Image id="mascot" src={logo} alt="DevDogs Logo" width="300" height="300"/>
        </div>
        <br/>
        <div className="grid">
          <Image id="demo" src={demo} alt="ACM OSP Demo" width="300" height="150"/>
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
            <br/>
            <p>Each year, we work hard to identify needs in Athens and solve them by taking solutions from concept to completion.</p>
          </div>
          <Image id="mockup" src={mockup} alt="ACM OSP Bus App Mockup" width="300" height="150"/>
        </div>

        <br />
        <h1 className="header">Sound interesting?</h1>
        <br />

        <div className="button-grid">
          <Link href="/about">
            <Button id="learnmore">Learn More</Button>
          </Link>
          <br/>
          <Link href="/events">
            <Button id="joinus">Join Us!</Button>
          </Link>
        </div>
      </div>
      <Footer />
    </div>

  )
}

export default Home;