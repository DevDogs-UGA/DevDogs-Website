import InstagramIcon from "@/app/images/instagram.svg";
import EMailIcon from "@/app/images/mail.svg";
import GitHubIcon from "@/app/images/github.svg";
import LinkedInIcon from "@/app/images/linkedin.svg";
import Image from "next/image";
import Link from "next/link";

export default function SocialsAndContact() {
  return (
    <div className="flex flex-col gap-4 text-center sm:text-left md:flex-row md:flex-nowrap">
      <div className="md:basis-2/3">
        <p className="font-[600]">
          Whether you’re a student or a sponsor with comments or concerns, reach
          us in your preferred way here.
        </p>
      </div>

      <div className="flex items-center justify-center gap-4 md:basis-1/3 md:justify-end">
        <Link
          target="_blank"
          href={
            "https://www.linkedin.com/company/devdogs-uga/posts/?feedView=all"
          }
        >
          <Image src={LinkedInIcon} />
        </Link>

        <Link target="_blank" href={"mailto:devdogs@uga.edu"}>
          <Image src={EMailIcon} />
        </Link>

        <Link target="_blank" href={"https://github.com/DevDogs-UGA"}>
          <Image src={GitHubIcon} />
        </Link>

        <Link
          target="_blank"
          href={"https://www.instagram.com/devdogs_uga/?hl=en"}
        >
          <Image src={InstagramIcon} />
        </Link>
      </div>
    </div>
  );
}
