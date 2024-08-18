import React, { useEffect } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import TempProjectImage from "../images/tempProject.png";
import Image from "next/image";
import EmblaCarousel from 'embla-carousel'
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures'




export default function CarouselAdvanced()
{

 
 const embla = EmblaCarousel(emblaRoot, { loop: false }, [WheelGesturesPlugin()]) // Add plugin

 const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false })

 useEffect(() =>
 {
  if (emblaApi)
  {
   console.log(emblaApi.slideNodes()) // Access API
  }
 }, [emblaApi])

 return (
  <div className="embla" ref={emblaRef}>
   <div className="flex gap-x-4 mx-auto">
    <div className="embla__slide"><Image src={TempProjectImage}></Image></div>
    <div className="embla__slide"><Image src={TempProjectImage}></Image></div>
    <div className="embla__slide"><Image src={TempProjectImage}></Image></div>
   </div>
  </div>
 )
}
