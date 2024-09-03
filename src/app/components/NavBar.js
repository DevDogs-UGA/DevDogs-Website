"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./NavBar.css";
import Button from "./Button";
import name2 from "../images/mascotwordlight.png";
import logoOnly from "../images/logo.png";
import Image from "next/image";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
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
  const getLinkClasses = (path) => {
    return `text-[2rem] px-3 no-underline ${pathname === path ? "text-UGASecondary font-semibold" : "hover:text-UGASecondary"}`;
  };
  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };
  return (
    <div className="w-full bg-[#31304b] flex flex-col sm:flex-row justify-around items-center text-white font-semibold p-[.8rem]">
      {" "}
      <div className="sm:hidden md:block sm:w-[300px] ">
        {" "}
        <Link href="/">
          {" "}
          <Image
            src={name2}
            alt="Mascot and DevDogs"
            className="hidden md:block h-[2.5em] w-auto"
          />{" "}
        </Link>{" "}
      </div>{" "}
      <div className="sm:hidden w-full flex justify-between items-center px-4">
        {" "}
        <Link href="/">
          {" "}
          <Image
            src={logoOnly}
            alt="Mascot"
            className="h-[3em] sm:h-[4em] w-auto"
          />{" "}
        </Link>{" "}
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
        )}{" "}
      </div>{" "}
      {isDropdownOpen && (
        <div className=" sm:hidden absolute top-[4rem] left-0 w-full bg-[#31304b] flex flex-col items-start px-4 space-y-2 py-4 z-10">
          {" "}
          {navLinks.map(({ name, path }) => (
            <Link
              key={name}
              href={path}
              className={`${getLinkClasses(path)} text-[2rem] text-left bg-opacity-5 rounded-md bg-[#31304b] w-full p-4 transition ease-in-out delay-150`}
            >
              {" "}
              <p>{name}</p>{" "}
            </Link>
          ))}{" "}
        </div>
      )}{" "}
      <div className="hidden sm:flex flex-nowrap justify-center items-center sm:gap-3">
        {" "}
        {navLinks.map(({ name, path }) => (
          <Link key={name} href={path} className={getLinkClasses(path)}>
            {" "}
            <p className="= transition ease-in-out delay-150 text-center p-0 m-0">
              {" "}
              {name}{" "}
            </p>{" "}
          </Link>
        ))}{" "}
      </div>{" "}
      <Link
        target="_blank"
        href="https://discord.com/invite/MuyJ4f5xKE"
        className="hidden lg:block text-lg md:text-xl rounded-full font-medium p-2 transition ease-in-out delay-50 text-white bg-[#BA0C2F] hover:bg-white hover:text-black"
      >
        {" "}
        <Button>Join Us</Button>{" "}
      </Link>{" "}
    </div>
  );
};
export default NavBar;
