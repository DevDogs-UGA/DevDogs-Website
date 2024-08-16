"use client"

import Link from "next/link"
import "./NavBar.css"
import Button from "./Button"
import name2 from "../images/mascotwordlight.png"
import logoOnly from "../images/logo.png"
import Image from "next/image"


const NavBar = () =>
{
    return (
        <div className=" w-full bg-[#31304b] flex flex-nowrap justify-around items-center text-white font-semibold h-[12vh] ">
            <div className="w-[300px]">
                <Image src={name2} alt="Mascot and DevDogs" className="hidden md:block" />
                <Image src={logoOnly} alt="Mascot" className="w-[100px] md:hidden md:w-[150px]" />
            </div>


            <div className="flex flex-nowrap justify-center items-center">
                <Link href="/" className=" hover:text-[#BA0C2F] sm:mx-2 transition ease-in-out delay-150">
                    <p className="text-[1.3rem] p-2 sm:text-[1.5rem] no-underline">Home</p>
                </Link>

                <Link href="/about" className="hover:text-[#BA0C2F] sm:mx-2 transition ease-in-out delay-150">
                    <p className="text-[1.3rem] p-2 sm:text-[1.5rem] no-underline">About</p>
                </Link>

                <Link href="/our-team" className="hover:text-[#BA0C2F] sm:mx-2 transition ease-in-out delay-150">
                    <p className="text-[1.3rem] p-2 sm:text-[1.5rem] no-underline">Team</p>
                </Link>

                <Link href="/events" className="hover:text-[#BA0C2F] sm:mx-2 transition ease-in-out delay-150">
                    <p className="text-[1.3rem] p-2 sm:text-[1.5rem] no-underline">Events</p>
                </Link>

                {/* <Link href="/resources">
                        <p>Resources</p>
                    </Link> */}
            </div>


            {/* <Link href="https://discord.com/invite/MuyJ4f5xKE" className="p-2 my-2 transition ease-in-out delay-150  hidden lg:block text-[1rem]  sm:text-[2rem] text-white bg-[#BA0C2F] hover:bg-white hover:text-black rounded-full">
                <Button>
                    <p className="text-[1rem]  sm:text-[2rem]">Join Us</p>
                    
                </Button>
            </Link> */}

            <Link href="https://discord.com/invite/MuyJ4f5xKE" className="hidden lg:block text-lg md:text-xl rounded-full font-medium m-4 p-2 transition ease-in-out delay-150 text-white bg-[#BA0C2F] hover:bg-white hover:text-black ">
                {/* <Button id="joinus-si">Join Us!</Button> */}
                <Button >Join Us!</Button>
            </Link>




        </div>

    )
}

export default NavBar;
