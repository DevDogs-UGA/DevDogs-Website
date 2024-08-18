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


 const pastProjects = [
  {
   image: TempProjectImage,
   title: "Project Name, 202#",
   description: "Brief description of project and its impact. Lorem ipsum dolor sit amet."
  },
  {
   image: TempProjectImage,
   title: "Project Name, 203#",
   description: "Brief description of project and its impact. Lorem ipsum dolor sit amet."
  },
  {
   image: TempProjectImage,
   title: "Project Name, 204#",
   description: "Brief description of project and its impact. Lorem ipsum dolor sit amet."
  }
 ]

 return (
  <div className="text-center container mx-auto w-[100%] section">

   <div className="my-[125px]">
    <h2 className=" font-bold text-[3.5rem] sm:text-[4.5rem] md:[5.5rem] inline">Our </h2><h2 className="font-bold text-[3.5rem] sm:text-[4.5rem] md:[5.5rem] text-UGA inline">Projects</h2>
    <p className="mt-[50px]">Each year, DevDogs embarks on a new full-stack software project, collaborating on a concept from idea to implementation. Our software projects are always open-sourced and aligned to benefit the UGA or Athens community. After all, we’re the most familiar with its pain-points, so we’re the best equipped to help our people one project at a time. Take a look at what we’ve done below!</p>
   </div>



   <h2 className=" font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] text-UGA inline">Current </h2> <h2 className="font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] text-black inline">Project</h2>
   {/* Carousel */}
   <GeneralCarousel slides={currentProjects} childrenClassName="my-[50px]" banner={false} />

   <p>DevDogs is proud to consist of ## UGA students from all tech disciplines and backgrounds. We firmly believe that different perspectives breed the best solutions--and we think our work shows! Take a look at some of the awesome people that have made DevDogs, DevDogs below.</p>
   <Link target="_blank" href="https://github.com/DevDogs-UGA" className="bg-UGA container transition ease-in-out duration-300 block mx-auto rounded-full max-w-[17rem] font-semibold py-3 my-[75px]  text-white hover:bg-black hover:text-white"><Button className="">View
   </Button></Link>


   <h2 className=" font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] text-UGA inline">Past </h2><h2 className="font-bold text-[2.5rem] sm:text-[3.5rem] md:[4rem] text-black inline">Projects</h2>
   {/* Casousel */}
   <div>
    <GeneralCarousel slides={pastProjects} childrenClassName="mt-[50px] mb-[125px]" banner={true} />

   </div>


  </div>
 )
}

export default Page;