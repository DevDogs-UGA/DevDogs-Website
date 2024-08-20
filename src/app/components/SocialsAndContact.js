import React from 'react'
import InstagramIcon from "@/app/images/instagram.svg"
import EMailIcon from "@/app/images/mail.svg"
import GitHubIcon from "@/app/images/github.svg"
import LinkedInIcon from "@/app/images/linkedin.svg"
import Image from "next/image"
import Link from "next/link"

export default function SocialsAndContact()
{
 return (
  <div className="text-center sm:text-left flex flex-col md:flex-row md:flex-nowrap gap-4">
   <div className="md:basis-2/3">
    <p className="font-[600]" >Whether you’re a student or a sponsor with comments or concerns, reach us in your preferred way here.</p>
   </div>


   <div className=" md:basis-1/3 flex items-center justify-center md:justify-end gap-4">
    <Link target="_blank" href={"https://www.linkedin.com/company/devdogs-uga/posts/?feedView=all"}><Image src={LinkedInIcon} /></Link>

    <Link target="_blank" href={"mailto:devdogs@uga.edu"}><Image src={EMailIcon} /></Link>

    <Link target="_blank" href={"https://github.com/DevDogs-UGA"}><Image src={GitHubIcon} /></Link>

    <Link target="_blank" href={"https://www.instagram.com/devdogs_uga/?hl=en"}><Image src={InstagramIcon} /></Link>

   </div>
  </div>
 )
}
