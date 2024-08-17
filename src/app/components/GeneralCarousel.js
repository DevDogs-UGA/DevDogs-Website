import Image from 'next/image';
import React, { useState, useEffect, useRef } from "react";

export default function GeneralCarousel({ slides, childrenClassName = "" })
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
  <div className="relative w-full max-w-4xl mx-auto overflow-hidden my-[125px]">
   <div className="flex w-full transition-transform duration-500 ease-in-out" ref={carouselRef}>
    {slides.map((slide, index) => (
     <div
      key={index}
      className={`flex-shrink-0 w-full flex flex-col items-center text-center space-y-4 shadow-xl ${childrenClassName}`}
     >
      <Image
       src={slide.image}
       alt={`Slide ${index}`}
       width={600}
       height={400}
       className="object-cover rounded-lg"
      />
      {slide.title && <h3 className="text-xl font-semibold ">{slide.title}</h3>}
      {slide.description && <p className="text-lg">{slide.description}</p>}
     </div>
    ))}
   </div>
  </div>
 );
}
