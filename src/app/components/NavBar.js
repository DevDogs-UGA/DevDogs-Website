"use client"

import Link from "next/link"
import "./NavBar.css"
import Button from "./Button"
import name2 from "../images/mascotwordlight.png"
import logoOnly from "../images/logo.png"
import Image from "next/image"
import MediaQuery from "react-responsive"
import { usePathname } from "next/navigation"

const navRoutes = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
    { name: "Team", path: "/our-team" },
    { name: "Events", path: "/events" },
];

const NavBar = () => {
    const pathname = usePathname();
    const links = [];

    for (const [i, route] of navRoutes.entries()) {
        let isCurrent = pathname === route.path;
        let id = isCurrent ? "nav-current" : "";
        links.push(
            <Link key={i} href={route.path}>
                <p className="link-text" id={id}>{route.name}</p>
            </Link>
        );
    }

    return (
        <div className="navbar">
            <MediaQuery minWidth={900}>
                <Image
                    id="name2"
                    src={name2}
                    style={{
                        height: 50,
                        width: 280,
                    }}
                    alt="Mascot and DevDogs"
                />
            </MediaQuery>
            <MediaQuery maxWidth={600}>
                <Image
                    id="name2"
                    src={logoOnly}
                    style={{
                        height: 60,
                        width: 45,
                    }}
                    alt="Mascot"
                />
            </MediaQuery>

            <div id="links">{links}</div>

            <MediaQuery minWidth={900}>
                <Link href="https://discord.com/invite/MuyJ4f5xKE">
                    <Button className="link-text" id="joinus">Join Us</Button>
                </Link>
            </MediaQuery>
        </div>
    )
}

export default NavBar;
