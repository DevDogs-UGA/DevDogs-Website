// General purpose carousel with out scaling effect, takes in two props and has childrenClass name where you can add your stlying.
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";

export default function GeneralCarousel({
  slides = [],
  childrenClassName = "",
  banner = false,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
    }, 5000); // Change picture every 5 seconds

    return () => clearInterval(intervalId); // Clear interval on component unmount
  }, [slides.length]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (carousel) {
      carousel.style.transition = "transform 1.5s ease-in-out";
      carousel.style.transform = `translateX(-${currentIndex * 100}%)`;
    }
  }, [currentIndex]);

  return (
    <div className="relative mx-auto w-full overflow-hidden">
      <div
        className="flex w-full transition-transform duration-500 ease-in-out"
        ref={carouselRef}
      >
        {slides.map((slide, index) => (
          <div
            key={index}
            className={`relative flex w-full flex-shrink-0 flex-col items-center text-center ${childrenClassName}`}
          >
            <Image
              src={slide.image}
              alt={`Slide ${index}`}
              width={1920}
              className="rounded-[2rem] object-cover"
            />
            {banner && (
              <div className="absolute inset-x-0 bottom-0 rounded-b-[2rem] bg-[#3a3a3a] py-[.25rem] text-white md:py-[1rem]">
                {slide.title && (
                  <h3 className="text-[1rem] font-bold sm:text-[1.5rem] md:text-[2rem] lg:text-[3rem]">
                    {slide.title}
                  </h3>
                )}
                {slide.description && (
                  <p className="mb-2 text-[.5rem] sm:text-[.75rem] md:text-[1rem]">
                    {slide.description}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

GeneralCarousel.propTypes = {
  slides: PropTypes.array,
  childrenClassName: PropTypes.string,
  banner: PropTypes.bool,
};
