"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./NavBar.css";
import Button from "./Button";
import name2 from "../images/mascotwordlight.png";
import logoOnly from "../images/logo.png";
import Image from "next/image";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/solid";
import { useState, useEffect, useRef } from "react";
import NavBarAvatar from "./NavbarAvatar";

const navLinks = [
  { name: "Home", path: "/", isDropdown: false },
  { name: "About", path: "/about", isDropdown: false },
  { name: "Team", path: "/about/people", isDropdown: false },
  { name: "Projects", path: "/about/projects", isDropdown: false },
  { name: "Events", path: "/about/events", isDropdown: false },
];

const NavBar = () => {
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const getLinkClasses = (path) => {
    return `text-xl px-3 no-underline ${
      pathname === path
        ? "text-GloryGloryRed font-semibold"
        : "hover:text-GloryGloryRed"
    }`;
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setIsDropdownOpen(false);
    }
  };

  useEffect(() => {
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  return (
    <div className="flex w-full flex-col items-center justify-around bg-[#31304b] p-[.8rem] font-semibold text-white sm:flex-row">
      <div className="sm:hidden sm:w-[300px] md:block">
        <Link href="/">
          <Image
            src={name2}
            alt="Mascot and DevDogs"
            className="hidden h-[2.5em] w-auto md:block"
          />
        </Link>
      </div>
      <div className="flex w-full items-center justify-between px-4 sm:hidden">
        <Link href="/">
          <Image
            src={logoOnly}
            alt="Mascot"
            className="h-[3em] w-auto sm:h-[4em]"
          />
        </Link>
        <NavBarAvatar />
        {isDropdownOpen ? (
          <XMarkIcon
            className="w-[2rem] cursor-pointer transition-transform"
            onClick={toggleDropdown}
          />
        ) : (
          <Bars3Icon
            className="w-[2rem] cursor-pointer transition-transform"
            onClick={toggleDropdown}
          />
        )}
      </div>
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-[4rem] z-10 flex w-full flex-col items-start space-y-2 bg-[#31304b] px-4 py-4 sm:hidden"
        >
          {navLinks.map(({ name, path }) => (
            <Link
              key={name}
              href={path}
              className={`${getLinkClasses(path)} w-full rounded-md bg-[#31304b] bg-opacity-5 p-4 text-left text-[2rem] transition delay-100 ease-out`}
            >
              <p>{name}</p>
            </Link>
          ))}
        </div>
      )}
      <div className="hidden flex-nowrap items-center justify-center sm:flex sm:gap-3">
        {navLinks.map(({ name, path }) => (
          <Link key={name} href={path} className={getLinkClasses(path)}>
            <p className="= m-0 p-0 text-center transition delay-150 ease-in-out">
              {name}
            </p>
          </Link>
        ))}
      </div>
      <div className="invisible flex flex-row items-center align-middle sm:visible">
        <Link
          target="_blank"
          href="https://discord.com/invite/MuyJ4f5xKE"
          className="delay-50 hidden rounded-full bg-[#BA0C2F] p-2 text-lg font-medium text-white transition ease-in-out hover:bg-white hover:text-black md:text-xl lg:block"
        >
          <Button className="hidden">Join Us</Button>
        </Link>
        <div>
          <NavBarAvatar />
        </div>
      </div>
    </div>
  );
};

export default NavBar;
