import NavBar from "../components/NavBar";
const AboutPage = () => {
    return (
        <div>
            <NavBar />
            <div id="abouttitle">
                <h3>System.out.println("Hello UGA!");</h3>
                <h1>We are <b id="devdawgs">DevDawgs</b>!</h1>
            </div>
        </div>
    )
}

export default AboutPage;