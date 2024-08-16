import Image from 'next/image';
import React, { useState, useEffect, useRef } from "react";

export default function HomePageCarousel({ roles })
{
 const [currentIndex, setCurrentIndex] = useState(0);
 const carouselRef = useRef(null);

 useEffect(() =>
 {
  const carousel = carouselRef.current;
  if (carousel)
  {
   carousel.style.transition = "transform 0.5s ease-in-out";
   carousel.style.transform = `translateX(-${currentIndex * 100}%)`;
  }
 }, [currentIndex]);

 const handleNext = () =>
 {
  setCurrentIndex((prevIndex) => (prevIndex + 1) % roles.length);
 };

 const handlePrev = () =>
 {
  setCurrentIndex((prevIndex) => (prevIndex - 1 + roles.length) % roles.length);
 };

 return (
  <div className='w-full overflow-hidden flex flex-nowrap '>
   <div><button className="" onClick={handlePrev}>
    &#8249; {/* Left arrow */}
   </button></div>
   <div className="w-full" ref={carouselRef}>
    {roles.map((role, index) => (
     <div className="" key={index}>
      <Image src={role.image} alt={`Slide ${index}`} width={200} height={500} />
      <div className="">
       <h3>{role.title}</h3>
       <p className="">{role.description}</p>
      </div>
     </div>
    ))}
   </div>
   <div>
    <button className="" onClick={handleNext}>
     &#8250; {/* Right arrow */}
    </button>
   </div>
  </div>
 );
}
