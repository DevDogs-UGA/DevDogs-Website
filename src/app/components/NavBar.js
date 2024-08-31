"use client";

import Link from "next/link";
import { usePathname } from "next/navigation"; // usePathname is a lightweight alternative to useRouter
import "./NavBar.css";
import Button from "./Button";
import name2 from "../images/mascotwordlight.png";
import logoOnly from "../images/logo.png";
import Image from "next/image";
// import { useState } from "react";

const NavBar = () => {
  const pathname = usePathname(); // Get the current path
  //const [aboutDropDownOpen, setAboutDropDownOpen] = useState(false);
  // const [SponsorDropDownOpen, setSponsorDropDownOpen] = useState(false);

  const getLinkClasses = (path) => {
    return `text-[1rem] px-3 no-underline ${pathname === path ? "text-UGASecondary font-semibold" : "hover:text-UGASecondary"}`;
  };

  return (
    <div className="w-full bg-[#31304b] flex flex-nowrap justify-around items-center text-white font-semibold p-[.8rem]">
      <div className="hidden sm:block sm:w-[300px] ">
        <Link href="/">
          <Image
            src={name2}
            alt="Mascot and DevDogs"
            className="hidden md:block h-[2.5em] w-auto"
          />
        </Link>
        <Link href="/">
          <Image
            src={logoOnly}
            alt="Mascot"
            className="md:hidden h-[4em] w-auto"
          />
        </Link>
      </div>

      <div className="flex flex-nowrap justify-center items-center sm:gap-3">
        <Link href="/" className={getLinkClasses("/")}>
          <p className="text-[1rem] sm:text-[1.5rem] transition ease-in-out delay-150 text-center p-0 m-0">
            Home
          </p>
        </Link>
        <div
          className="relative group flex items-center"
          // onMouseEnter={() => setAboutDropDownOpen(true)}
          // onMouseLeave={() => setAboutDropDownOpen(false)}
        >
          <Link href="/about" className={getLinkClasses("/about")}>
            <p className="text-[1rem] sm:text-[1.5rem] transition ease-in-out delay-150 text-center p-0 m-0">
              About
            </p>
          </Link>
          {/* <div
            className={`text-[1rem] p-1 sm:p-2 sm:text-[1.5rem] absolute left-[-.75rem] top-[2rem] sm:top-10 w-[7.5rem] sm:mt-1 sm:w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 transition-all duration-150 ${
              aboutDropDownOpen
                ? "opacity-300 visible"
                : "opacity-100 invisible"
            }`}
          >
            <div className=" text-left">
              <Link
                href="/about/people"
                className="p-2 rounded-[.5rem] block sm:pl-3 sm:py-2 text-gray-700 hover:bg-gray-200 hover:text-black sm:text-lg"
              >
                People
              </Link>
              <Link
                href="/about/projects"
                className="p-2 rounded-[.5rem] block sm:pl-3 sm:py-2 text-gray-700 hover:bg-gray-200 hover:text-black sm:text-lg"
              >
                Projects
              </Link>
              <Link
                href="/about/events"
                className="p-2 rounded-[.5rem] block sm:pl-3 sm:py-2 text-gray-700 hover:bg-gray-200 hover:text-black sm:text-lg"
              >
                Events
              </Link>
            </div>
          </div> */}
        </div>

        <Link href="/about/people" className={getLinkClasses("/about/people")}>
          <p className="text-[1rem] sm:text-[1.5rem] transition ease-in-out delay-150 text-center p-0 m-0">
            Team
          </p>
        </Link>

        <Link href="/about/projects" className={getLinkClasses("/about/projects")}>
          <p className="text-[1rem] sm:text-[1.5rem] transition ease-in-out delay-150 text-center p-0 m-0">
            Projects
          </p>
        </Link>

        <Link href="/about/events" className={getLinkClasses("/about/events")}>
          <p className="text-[1rem] sm:text-[1.5rem] transition ease-in-out delay-150 text-center p-0 m-0">
            Events
          </p>
        </Link>

        {/* For Later use do not uncomment */}

        {/* <Link href="/academy" className={getLinkClasses("/academy")}>
          <p className="text-[1.2rem] sm:text-[1.7rem]  transition ease-in-out delay-150 text-center p-0 m-0">
            Academy
          </p>
        </Link> */}

        {/* <div
                    className="relative group flex items-center"
                    onMouseEnter={() => setSponsorDropDownOpen(true)}
                    onMouseLeave={() => setSponsorDropDownOpen(false)}
                >
                    <h3 className={` transition ease-in-out delay-150 text-center p-0 m-0 ${pathname.startsWith('/sponsor') ? 'text-red-600 font-semibold' : 'hover:text-UGASecondary'}`}>
                        <p className="text-[1.2rem] sm:text-[1.7rem] no-underline p-0 m-0">Sponsor</p>
                    </h3>
                    <div
                        className={`p-1 sm:p-2 absolute top-[2rem] sm:top-[3rem] left-[-0.75rem] w-[8rem] sm:w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 transition-all duration-150 ${SponsorDropDownOpen ? 'opacity-300 visible' : 'opacity-100 invisible'
                            }`}
                    >
                        <div className=" text-[1rem] sm:text-[1.5rem]">
                            <Link href="/sponsor/sponsor-us" className="p-2 rounded-[.5rem] block sm:pl-3 sm:py-2 text-gray-700 hover:bg-gray-200 hover:text-black sm:text-lg">
                                Sponsor Us
                            </Link>
                            <Link href="/sponsor/our-sponsors" className="p-2 rounded-[.5rem] block sm:pl-3 sm:py-2 text-gray-700 hover:bg-gray-200 hover:text-black sm:text-lg">
                                Our Sponsor
                            </Link>

                        </div>
                    </div>
                </div> */}

        {/* Commented out until contact form automatic submission functionality is complete */}
        {/* <Link href="/contact" className={getLinkClasses("/contact")}>
          <p className="text-[1.2rem] sm:text-[1.7rem]  transition ease-in-out delay-150 text-center p-0 m-0">
            Contact
          </p>
        </Link> */}
      </div>

      <Link
        target="_blank"
        href="https://discord.com/invite/MuyJ4f5xKE"
        className="hidden lg:block text-lg md:text-xl rounded-full font-medium p-2 transition ease-in-out delay-150 text-white bg-[#BA0C2F] hover:bg-white hover:text-black"
      >
        <Button>Join Us</Button>
      </Link>
    </div>
  );
};

export default NavBar;
