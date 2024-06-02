import Link from "next/link";
import "./NavBar.css"
import Button from "./Button";

const NavBar = () => {
    return (
        <div className="navbar">
            <p id="title"><b>DevDogs</b></p>
            <div className="links">
                <Link href="/">
                    <p>Home</p>
                </Link>

                <Link href="/about">
                    <p>About</p>
                </Link>

                <Link href="/resources">
                    <p>Resources</p>
                </Link>

                <Link href="/events">
                    <p>Events</p>
                </Link>
            </div>
            <Link href="/events">
                <Button id="joinus">Join Us</Button>
            </Link>
            
        </div>
    )
}

export default NavBar;