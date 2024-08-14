"use client";

import React, { useState, useEffect, useRef } from 'react';
import Slider from 'react-slick';
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import './Carousel.css';
import Image from 'next/image';

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
  };

  return (
    <div className="carousel-container" style={{ height: sliderHeight }} ref={sliderRef}>
      <Slider {...settings}>
        {images.map((url, index) => (
          <div key={index} className='full-width-slide'>
            <Image src={url} alt={`Slide ${index + 1}`} className="carousel-image" width="100" height="100"/>
          </div>
        ))}
      </Slider>
    </div>
  );
};

export default Carousel;
