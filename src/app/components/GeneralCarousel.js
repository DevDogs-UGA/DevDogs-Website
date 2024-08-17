import Image from 'next/image';
import React, { useState, useEffect, useRef } from "react";

export default function GeneralCarousel({ slides = [], childrenClassName = "", banner = false })
{
 const [currentIndex, setCurrentIndex] = useState(0);
 const carouselRef = useRef(null);

 useEffect(() =>
 {
  const intervalId = setInterval(() =>
  {
   setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
  }, 5000); // Change picture every 5 seconds

  return () => clearInterval(intervalId); // Clear interval on component unmount
 }, [slides.length]);

 useEffect(() =>
 {
  const carousel = carouselRef.current;
  if (carousel)
  {
   carousel.style.transition = "transform 1.5s ease-in-out";
   carousel.style.transform = `translateX(-${currentIndex * 100}%)`;
  }
 }, [currentIndex]);

 return (
  <div className="relative w-full mx-auto overflow-hidden">
   <div className="flex w-full transition-transform duration-500 ease-in-out" ref={carouselRef}>
    {slides.map((slide, index) => (
     <div
      key={index}
      className={`relative flex-shrink-0 w-full flex flex-col items-center text-center ${childrenClassName}`}
     >
      <Image
       src={slide.image}
       alt={`Slide ${index}`}
       width={1920}
       className="object-cover rounded-[2rem]"
      />
      {banner && (
       <div className="absolute inset-x-0 py-[.25rem] md:py-[1rem] bottom-0 bg-[#3a3a3a]  text-white rounded-b-[2rem]">
        {slide.title && <h3 className="text-[1rem] sm:text-[1.5rem] md:text-[2rem] lg:text-[3rem] font-bold">{slide.title}</h3>}
        {slide.description && <p className="mb-2 text-[.5rem] sm:text-[.75rem] md:text-[1rem] ">{slide.description}</p>}
       </div>
      )}
     </div>
    ))}
   </div>
  </div>
 );
}
