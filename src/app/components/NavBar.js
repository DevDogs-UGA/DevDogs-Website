"use client"

import Link from "next/link"
import "./NavBar.css"
import Button from "./Button"
import name2 from "../images/mascotwordlight.png"
import logoOnly from "../images/logo.png"
import Image from "next/image"
import MediaQuery from "react-responsive"

const NavBar = () =>
{
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

            <div className="flex flex-auto flex-nowrap justify-around items-center text-white font-semibold">

                <Link href="/" className=" hover:text-[#BA0C2F] transition ease-in-out delay-150">
                    <p className="text-base md:text-lg lg:text-xl no-underline">Home</p>
                </Link>

                <Link href="/about" className="hover:text-[#BA0C2F] transition ease-in-out delay-150">
                    <p className="text-base md:text-lg lg:text-xl">About</p>
                </Link>

                <Link href="/our-team" className="hover:text-[#BA0C2F] transition ease-in-out delay-150">
                    <p className="text-base md:text-lg lg:text-xl">Team</p>
                </Link>

                {/* <Link href="/resources">
                        <p>Resources</p>
                    </Link> */}

                <Link href="/events" className="hover:text-[#BA0C2F] transition ease-in-out delay-150">
                    <p className="text-base md:text-lg lg:text-xl">Events</p>
                </Link>
                <MediaQuery minWidth={1224}>
                    <Link href="https://discord.com/invite/MuyJ4f5xKE" className="text-base md:text-lg rounded-full font-medium m-4 p-0 transition ease-in-out delay-150 text-white bg-[#BA0C2F] hover:bg-red-200 hover:text-black">
                        <Button className="hover:bg-slate-300 p-1">Join Us</Button>
                    </Link>
                </MediaQuery>

            </div>
        </div>
    )
}

export default NavBar;
