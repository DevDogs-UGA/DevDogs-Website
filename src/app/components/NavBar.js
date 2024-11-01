"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ChevronUp, ChevronDown } from "lucide-react";
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
  { name: "Contact", path: "/contact", isDropdown: false },
];

const NavBar = () => {
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  const toggleDropdown = (name) => {
    setIsDropdownOpen(isDropdownOpen === name ? null : name);
  };

  const handleClickOutside = (event) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target) &&
      !event.target.closest(".child-link")
    ) {
      setIsDropdownOpen(null);
    }
  };

  useEffect(() => {
    if (isDropdownOpen || isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen, isMobileMenuOpen]);

  return (
    <div className="flex w-full flex-col items-center justify-around bg-[#31304b] p-[.8rem] font-semibold text-white sm:flex-row">
      {/* Logo */}
      <div className="sm:hidden sm:w-[300px] lg:block">
        <Link href="/">
          <Image
            src={name2}
            alt="Mascot and DevDogs"
            className="hidden h-[2.5em] w-auto md:block"
          />
        </Link>
      </div>

      {/* Mobile Hamburger Menu */}
      <div className="flex w-full items-center justify-between px-4 sm:hidden">
        <Link href="/">
          <Image
            src={logoOnly}
            alt="Mascot"
            className="h-[3em] w-auto sm:h-[4em]"
          />
        </Link>
        <NavBarAvatar />
        {isMobileMenuOpen ? (
          <XMarkIcon
            className="w-[2rem] cursor-pointer"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        ) : (
          <Bars3Icon
            className="w-[2rem] cursor-pointer"
            onClick={() => setIsMobileMenuOpen(true)}
          />
        )}
      </div>

      {/* Mobile Dropdown Menu */}
      {isMobileMenuOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-[4rem] z-10 flex w-full flex-col gap-4 bg-[#31304b] p-4 sm:hidden"
        >
          {navLinks.map((link) => (
            <div key={link.name} className="w-full">
              {link.isDropdown ? (
                <div className="w-full">
                  <div
                    onClick={() => toggleDropdown(link.name)}
                    className="flex w-full cursor-pointer flex-row-reverse items-center gap-x-2 text-2xl"
                  >
                    {isDropdownOpen === link.name ? (
                      <ChevronUp />
                    ) : (
                      <ChevronDown />
                    )}
                    {link.name}
                  </div>
                  {isDropdownOpen === link.name && (
                    <div className="mt-2 pl-4 text-right">
                      {link.children.map((child) => (
                        <Link
                          key={child.name}
                          href={child.path}
                          className="child-link block py-1 pl-4 text-lg text-gray-400"
                          onClick={() => setIsMobileMenuOpen(false)} // Close mobile menu after clicking
                        >
                          {child.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href={link.path}
                  className="w-full py-2 text-right text-2xl"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.name}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Desktop Navbar */}
      <div className="hidden flex-nowrap items-center justify-center sm:flex sm:gap-4">
        {navLinks.map((link) => (
          <div key={link.name} className="relative">
            {link.isDropdown ? (
              <div
                className="cursor-pointer px-3 text-2xl text-gray-400 hover:text-white"
                onMouseEnter={() => toggleDropdown(link.name)}
              >
                {link.name}
                {isDropdownOpen === link.name ? (
                  <ChevronUp className="ml-1 inline" />
                ) : (
                  <ChevronDown className="ml-1 inline" />
                )}
              </div>
            ) : (
              <Link
                href={link.path}
                className="px-3 text-2xl text-gray-400 no-underline hover:text-white"
                onMouseLeave={() => toggleDropdown(null)}
              >
                {link.name}
              </Link>
            )}

            {isDropdownOpen === link.name && link.isDropdown && (
              <div
                ref={dropdownRef}
                className="absolute mt-2 bg-[#31304b] py-2"
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
      <div className="invisible flex flex-row items-center align-middle sm:visible">
        <Link
          target="_blank"
          href="https://discord.com/invite/MuyJ4f5xKE"
          className="delay-50 hidden rounded-full bg-[#BA0C2F] p-2 text-lg text-white transition ease-in-out hover:bg-white hover:text-black lg:block"
        >
          <Button>Join Us</Button>
        </Link>
        <NavBarAvatar />
      </div>
    </div>
  );
};

export default NavBar;
