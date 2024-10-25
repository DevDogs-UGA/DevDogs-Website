import "./Footer.css";
import Link from "next/link";
import Image from "next/image";
import instagramIcon from "../images/instagram.svg";
import linkedInIcon from "../images/linkedin.svg";
import githubIcon from "../images/github.svg";

export default function Footer() {
  return (
    <div className="footer pt-[10rem]">
      <div className="my-16 flex flex-row items-start justify-around px-10 sm:items-center">
        <p className="mr-auto text-left text-[1rem] font-bold sm:text-lg">
          &copy; {new Date().getFullYear()} DevDogs at the University of Georgia
        </p>
        <div className="flex flex-row flex-wrap items-center justify-center sm:flex-nowrap">
          <p className="block text-[1rem] sm:text-lg">Follow us for more: </p>
          <Link
            target="_blank"
            href=" https://www.instagram.com/devdogs_uga/"
            className="block"
          >
            <Image src={instagramIcon} alt="Instagram Link" />
          </Link>

          <Link
            target="_blank"
            href=" https://www.linkedin.com/company/devdogs-uga/"
            className="block"
          >
            {" "}
            <Image src={linkedInIcon} alt="LinkedIn Link" />
          </Link>

          <Link
            target="_blank"
            href=" https://github.com/DevDogs-UGA"
            className="block"
          >
            {" "}
            <Image src={githubIcon} alt="Github Link" />
          </Link>
        </div>
      </div>
    </div>
  );
}
