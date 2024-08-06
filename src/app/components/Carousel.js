"use client"; //very important line do not remove

import React, { useState, useEffect, useRef } from 'react';
import Slider from 'react-slick';
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import './Carousel.css'; // Import your updated CSS file

const Carousel = ({ images }) => {
  const [sliderHeight, setSliderHeight] = useState('auto');
  const sliderRef = useRef(null);

  const settings = {
    className: "center",
    centerMode: true,
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true, // Enable autoplay
    autoplaySpeed: 3000, // Time between slides in milliseconds
    
    // afterChange: () => adjustHeight()
    
  };

  const adjustHeight = () => {
    if (sliderRef.current) {
      const currentSlide = sliderRef.current.querySelector('.slick-current img');
      if (currentSlide) {
        setSliderHeight(currentSlide.clientHeight);
      }
    }
  };

  /* 
  useEffect(() => {
    adjustHeight();
    window.addEventListener('resize', adjustHeight);
    return () => window.removeEventListener('resize', adjustHeight);
  }, []);
  */
  



  return (
    <div className="carousel-container" style={{ height: sliderHeight }} ref={sliderRef}>
      <Slider {...settings}>
        {images.map((url, index) => (
          <div key={index}>
            <img src={url} alt={`Slide ${index + 1}`} className="carousel-image" />
          </div>
        ))}
      </Slider>
    </div>
  );
};

export default Carousel;
