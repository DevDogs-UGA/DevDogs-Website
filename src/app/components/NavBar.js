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
          className="absolute left-0 top-[4rem] z-10 flex w-full flex-col items-start bg-[#31304b] px-4 py-4 sm:hidden"
        >
          {navLinks.map((link) => (
            <div key={link.name} className="w-full">
              {link.isDropdown ? (
                <div className="w-full">
                  {/* Parent link */}
                  <div className="w-full cursor-pointer text-left text-2xl">
                    {link.name}
                  </div>
                  {/* Always show child links */}
                  <div className="mt-2 pl-4">
                    {link.children.map((child) => (
                      <Link
                        key={child.name}
                        href={child.path}
                        className="block py-1 pl-4 text-lg text-gray-400"
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  href={link.path}
                  className="w-full py-2 text-left text-2xl"
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
                onClick={() => toggleDropdown(link.name)}
                className={`cursor-pointer px-3 text-2xl ${
                  isParentActive(link.children)
                    ? "font-bold text-white"
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
