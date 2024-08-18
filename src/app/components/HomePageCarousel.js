import Image from 'next/image';
import React, { useState, useEffect, useRef } from "react";

export default function HomePageCarousel({ roles })
{
 const [currentIndex, setCurrentIndex] = useState(0);
 const carouselRef = useRef(null);

 useEffect(() =>
 {
  const intervalId = setInterval(() =>
  {
   setCurrentIndex((prevIndex) => (prevIndex + 1) % roles.length);
  }, 5000); // Change picture every 3 seconds

  return () => clearInterval(intervalId); // Clear interval on component unmount
 }, [roles.length]);

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
  <div className="relative w-full max-w-4xl mx-auto overflow-hidden">
   <div className="flex w-full transition-transform duration-500 ease-in-out" ref={carouselRef}>
    {roles.map((role, index) => (
     <div
      key={index}
      className="flex-shrink-0 w-full flex flex-col items-center text-center space-y-4"
     >
      <h3 className="text-xl font-semibold">{role.title}</h3>
      <Image src={role.image} alt={`Slide ${index}`} width={600} height={400} className="object-cover rounded-lg border-[5px] border-black" />
      <p className="text-lg">{role.description}</p>
     </div>
    ))}
   </div>
  </div>
 );
}
