import Link from "next/link"
import "./NavBar.css"
import Button from "./Button"
import name from "../images/mascotword.png"
import name2 from "../images/mascotwordlight.png"
import Image from "next/image"

const NavBar = () => {
    return (
        <div className="navbar">
            <Image 
            id="name2" 
            src={name2} 
            alt="Mascot and DevDogs" 
            />
            <div className="links">
                
                <Link href="/">
                <p>Home</p>
                </Link>

                <Link href="/about">
                    <p>About</p>
                </Link>

                <Link href="/our-team">
                    <p>Our Team</p>
                </Link>

                <Link href="/resources">
                    <p>Resources</p>
                </Link>

                <Link href="/events">
                    <p>Events</p>
                </Link>
              
                <Link href="/events">
                <Button id="joinus">Join Us</Button>
            </Link>
                
            </div>
 
        </div>
    )
}
//<Image id="name" src={name} alt="Mascot and DevDogs" />

export default NavBar;
