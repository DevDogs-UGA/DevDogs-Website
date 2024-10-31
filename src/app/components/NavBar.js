"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/solid";
import NavBarAvatar from "./NavBarAvatar";
import Button from "./Button";
import name2 from "../images/mascotwordlight.png";
import logoOnly from "../images/logo.png";

const navLinks = [
  { name: "Home", path: "/", isDropdown: false },
  {
    name: "About",
    isDropdown: true,
    children: [
      { name: "Our People", path: "/about/people" },
      { name: "Our Events", path: "/about/events" },
      { name: "Our Projects", path: "/about/projects" },
    ],
  },
  {
    name: "Partners",
    isDropdown: true,
    children: [
      { name: "Corporate Sponsors", path: "/sponsor/our-sponsors" },
      { name: "Campus Partners", path: "/sponsor/our-partners" },
      { name: "Sponsor Now", path: "/sponsor/sponsor-us" },
    ],
  },
  // { name: "Academy", path: "/academy", isDropdown: false },

  // Academy is disabled until it is complete - Jay

  { name: "Contact", path: "/contact", isDropdown: false },
];

const NavBar = () => {
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(null);
  const dropdownRef = useRef(null);

  const getLinkClasses = (path) => {
    return `text-2xl px-3 no-underline ${
      pathname === path
        ? "text-white font-bold"
        : "hover:text-GloryGloryRed text-gray-400"
    }`;
  };

  const isParentActive = (children) => {
    return children.some((child) => pathname.startsWith(child.path));
  };

  const toggleDropdown = (name) => {
    setIsDropdownOpen(isDropdownOpen === name ? null : name);
  };

  const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setIsDropdownOpen(null);
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
    <div className="w-full bg-[#31304b] flex flex-col sm:flex-row justify-around items-center text-white font-semibold p-[.8rem]">
      {/* Logo */}
      <div className="sm:hidden lg:block sm:w-[300px]">
        <Link href="/">
          <Image
            src={name2}
            alt="Mascot and DevDogs"
            className="hidden h-[2.5em] w-auto md:block"
          />
        </Link>
      </div>


      {/* Mobile Hamburger Menu */}
      <div className="sm:hidden w-full flex justify-between items-center px-4">
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
            className="w-[2rem] cursor-pointer"
            onClick={() => toggleDropdown(null)}
          />
        ) : (
          <Bars3Icon
            className="w-[2rem] cursor-pointer"
            onClick={() => toggleDropdown("mobile")}
          />
        )}
      </div>

      {/* Mobile Dropdown Menu */}
      {isDropdownOpen === "mobile" && (
        <div
          ref={dropdownRef}
          className="sm:hidden absolute top-[4rem] left-0 w-full bg-[#31304b] flex flex-col items-start px-4 py-4 z-10"
        >
          {navLinks.map((link) => (
            <div key={link.name} className="w-full">
              {link.isDropdown ? (
                <div className="w-full">
                  {/* Parent link */}
                  <div className="text-2xl cursor-pointer w-full text-left">
                    {link.name}
                  </div>
                  {/* Always show child links */}
                  <div className="pl-4 mt-2">
                    {link.children.map((child) => (
                      <Link
                        key={child.name}
                        href={child.path}
                        className="block text-lg py-1 pl-4 text-gray-400"
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  href={link.path}
                  className="text-2xl w-full text-left py-2"
                >
                  {link.name}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Desktop Navbar */}
      <div className="hidden sm:flex flex-nowrap justify-center items-center sm:gap-4">
        {navLinks.map((link) => (
          <div key={link.name} className="relative">
            {link.isDropdown ? (
              <div
                onClick={() => toggleDropdown(link.name)}
                className={`text-2xl px-3 cursor-pointer ${
                  isParentActive(link.children)
                    ? "text-white font-bold"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {link.name}
              </div>
            ) : (
              <Link href={link.path} className={getLinkClasses(link.path)}>
                {link.name}
              </Link>
            )}

            {isDropdownOpen === link.name && (
              <div
                ref={dropdownRef}
                className="absolute bg-[#31304b] mt-2 py-2"
              >
                {link.children.map((child) => (
                  <Link
                    key={child.name}
                    href={child.path}
                    className="block px-4 py-2 hover:bg-gray-700"
                  >
                    {child.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Join Us and Avatar */}
      <div className="flex flex-row align-middle items-center sm:visible invisible">
        <Link
          target="_blank"
          href="https://discord.com/invite/MuyJ4f5xKE"
          className="hidden lg:block text-lg rounded-full p-2 transition ease-in-out delay-50 text-white bg-[#BA0C2F] hover:bg-white hover:text-black"
        >
          <Button>Join Us</Button>
        </Link>
        <NavBarAvatar />
      </div>
    </div>
  );
};

export default NavBar;
