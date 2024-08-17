"use client"

import Link from "next/link"
import "./NavBar.css"
import Button from "./Button"
import name2 from "../images/mascotwordlight.png"
import logoOnly from "../images/logo.png"
import Image from "next/image"
import React, { useState } from 'react';



const NavBar = () =>
{
    const [aboutDropDownOpen, setAboutDropDownOpen] = useState(false);

    return (
        <div className=" w-full bg-[#31304b] flex flex-nowrap justify-around items-center text-white font-semibold h-[15vh] ">
            <div className="w-[300px]">
                <Link href="/">
                    <Image src={name2} alt="Mascot and DevDogs" className="hidden md:block" />
                </Link>
                <Link href="/">
                    <Image src={logoOnly} alt="Mascot" className="w-[100px] md:hidden md:w-[150px]" />
                </Link>
            </div>


            <div className="flex flex-nowrap justify-center items-center">
                <Link href="/" className=" hover:text-UGA sm:mx-2 transition ease-in-out delay-150 ">
                    <p className="text-[1.3rem] p-2 sm:text-[1.5rem] no-underline">Home</p>
                </Link>
                <div
                    className="relative group flex items-center"
                    onMouseEnter={() => setAboutDropDownOpen(true)}
                    onMouseLeave={() => setAboutDropDownOpen(false)}
                >
                    <Link href="/about" className="hover:text-UGA sm:mx-2 transition ease-in-out delay-150">
                        <p className="text-[1.3rem] p-2 sm:text-[1.5rem] no-underline">About</p>
                    </Link>
                    <div
                        className={`absolute top-10 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 transition-all duration-300 ${aboutDropDownOpen ? 'opacity-300 visible' : 'opacity-100 invisible'
                            }`}
                    >
                        <div className="py-1">
                            <Link href="/about/people" className="text- block px-4 py-2 text-gray-700 hover:bg-gray-200 hover:text-black text-lg">
                                People
                            </Link>
                            <Link href="/about/projects" className="block px-4 py-2 text-gray-700 hover:bg-gray-200 hover:text-black text-lg">
                                Projects
                            </Link>
                            <Link href="/about/events" className="block px-4 py-2 text-gray-700 hover:bg-gray-200 hover:text-black text-lg">
                                Events
                            </Link>
                        </div>
                    </div>
                </div>

                <Link href="/academy" className="hover:text-UGA sm:mx-2 transition ease-in-out delay-150">
                    <p className="text-[1.3rem] p-2 sm:text-[1.5rem] no-underline">Academy</p>
                </Link>
                <Link href="/contact" className="hover:text-UGA sm:mx-2 transition ease-in-out delay-150">
                    <p className="text-[1.3rem] p-2 sm:text-[1.5rem] no-underline">Contact</p>
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

            <Link target="_blank" href="https://discord.com/invite/MuyJ4f5xKE" className="hidden lg:block text-lg md:text-xl rounded-full font-medium m-4 p-2 transition ease-in-out delay-150 text-white bg-[#BA0C2F] hover:bg-white hover:text-black ">
                {/* <Button id="joinus-si">Join Us!</Button> */}
                <Button >Join Us!</Button>
            </Link>




        </div>

    )
}

export default NavBar;
