import "./Home.css"
import Button from "./components/Button";
import Footer from "./components/Footer";
import NavBar from "./components/NavBar";
import logo from "./images/logo.png";
import demo from "./images/demo.png";
import mockup from "./images/mockup.png";


const Home = () => {
  return (
    <div>
      <NavBar />
      <div class="section">
        <div id="hometitle" className="grid">
          <div>
            <h2>Hello, UGA;</h2>
            <h1>We are <div class="red-bold">DevDogs</div>,</h1>
          </div>
          <img src={logo} alt="DevDogs Logo" />
        </div>
        <br/>
        <div className="grid">
          <img src={demo} alt="ACM OSP Demo"/>
          <div id="description">
            <h4>a team of</h4>
            <h4>passionate</h4>
            <h1>Student</h1>
            <h1 class="dark_red-bold">Developers</h1>
            <p>at UGA.</p>  
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
          <img src={mockup} alt="ACM OSP Bus App Mockup"/>
        </div>

        <br />
        <h2 className="header">Sound interesting?</h2>
        <br />

        <div className="button-grid">
          <Button id="learnmore">Learn More</Button>
          <br/>
          <Button id="joinus">Join Us!</Button>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default Home;