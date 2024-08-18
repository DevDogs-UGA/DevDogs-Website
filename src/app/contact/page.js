import InstagramIcon from "@/app/images/instagram.svg"
import EMailIcon from "@/app/images/mail.svg"
import GitHubIcon from "@/app/images/github.svg"
import LinkedInIcon from "@/app/images/linkedin.svg"
import Image from "next/image"
import Link from "next/link"

const Page = () =>
{
    return (
        <div className="w-full section flex flex-col h-[100vh]">
            <div className="text-center my-[4rem]">
                <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] text-UGASecondary">Contact </h2>
                <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">Us</h2>

            </div>
            <div className="text-center sm:text-left flex flex-wrap sm:flex-nowrap ">
                <p className="font-[500]">Whether you’re a student or a sponsor with comments or concerns, reach us in your preferred way here.</p>

                <div className=" flex flex-nowrap items-center justify-around gap-4">
                    <Link target="_blank" href={"https://www.linkedin.com/company/devdogs-uga/posts/?feedView=all"}><Image src={LinkedInIcon} /></Link>

                    <Link target="_blank" href={"mailto:devdogs@uga.edu"}><Image src={EMailIcon} /></Link>

                    <Link target="_blank" href={"https://github.com/DevDogs-UGA"}><Image src={GitHubIcon} /></Link>

                    <Link target="_blank"href={"https://www.instagram.com/devdogs_uga/?hl=en"}><Image src={InstagramIcon} /></Link>

                </div>
            </div>
        </div>
    )
}

export default Page;