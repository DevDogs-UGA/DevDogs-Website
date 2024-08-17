"use client"
import Image from "next/image"
import Link from "next/link"
import Button from "../../components/Button"
import GeneralCarousel from "../../components/GeneralCarousel"
import TempProjectImage from "../../images/tempProject.png"



const Page = () =>
{

 const currentProjects = [
  {
   image: TempProjectImage
  },
  {
   image: TempProjectImage
  },
  {
   image: TempProjectImage
  }
 ]
 return (
  <div className="text-center container mx-auto w-[70%]">
   <h3 className="font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] inline">Our <h3 className="text-UGA inline">Projects</h3></h3>
   <p>Each year, DevDogs embarks on a new full-stack software project, collaborating on a concept from idea to implementation. Our software projects are always open-sourced and aligned to benefit the UGA or Athens community. After all, we’re the most familiar with its pain-points, so we’re the best equipped to help our people one project at a time. Take a look at what we’ve done below!</p>
   <h3 className=" font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] text-UGA inline">Current <h3 className="text-black inline">Project</h3></h3>
   {/* Carousel */}
   <GeneralCarousel slides={currentProjects} />

   <p>DevDogs is proud to consist of ## UGA students from all tech disciplines and backgrounds. We firmly believe that different perspectives breed the best solutions--and we think our work shows! Take a look at some of the awesome people that have made DevDogs, DevDogs below.</p>

   <Button className="bg-UGA container block mx-auto py-1 px-5 text-white hover:bg-black hover:text-black">View
   </Button>

   <h3 className=" font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] text-UGA inline">Past <h3 className="text-black inline">Projects</h3></h3>
   {/* Casousel */}

  </div>
 )
}

export default Page;