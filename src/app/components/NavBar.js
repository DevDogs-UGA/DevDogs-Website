"use client"

import Link from "next/link"
import "./NavBar.css"
import Button from "./Button"
import name2 from "../images/mascotwordlight.png"
import logoOnly from "../images/logo.png"
import Image from "next/image"
import { useState } from "react"
import MediaQuery from "react-responsive"

const NavBar = () => {
    return (
        <div className="navbar">
            <MediaQuery minWidth={1224}>
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
            
            <div className="links">

                <Link href="/">
                    <p className="small">Home</p>
                </Link>

                <Link href="/about">
                    <p className="small">About</p>
                </Link>

                <Link href="/our-team">
                    <p className="small">Team</p>
                </Link>

                {/* <Link href="/resources">
                        <p>Resources</p>
                    </Link> */}

                <Link href="/events">
                    <p className="small">Events</p>
                </Link>
                <MediaQuery minWidth={1224}>
                    <Link href="https://discord.com/invite/MuyJ4f5xKE">
                        <Button id="joinus">Join Us</Button>
                    </Link>
                </MediaQuery>
                
            </div>
        </div>
    )
}

export default NavBar;
