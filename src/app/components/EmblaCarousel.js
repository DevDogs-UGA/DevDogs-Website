import { useCallback, useEffect, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import "./embla.css";
import PropTypes from "prop-types";

// Documentation for external library used: https://www.embla-carousel.com/examples/predefined/

// This carousel has a zoom in and zoom out effect on autoplay with the spotlight on the middle slide, majority of the code is from Embla Carousel. The component takes in 3 props, the slides(array of images), banner(boolean to check if you want a banner, and options(which outline the behavious of the carousel. To learn more about the different option go to the documentation at Embla Carousel))

const TWEEN_FACTOR_BASE = 0.52;

const numberWithinRange = (number, min, max) =>
  Math.min(Math.max(number, min), max);

// Custom useInterval hook
function useInterval(callback, delay) {
  const savedCallback = useRef();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

const EmblaCarousel = (props) => {
  const { slides, options } = props;
  const [emblaRef, emblaApi] = useEmblaCarousel(options);
  const tweenFactor = useRef(0);
  const tweenNodes = useRef([]);

  const setTweenNodes = useCallback((emblaApi) => {
    tweenNodes.current = emblaApi
      .slideNodes()
      .map((slideNode) => slideNode.querySelector(".embla__slide__number"));
  }, []);

  const setTweenFactor = useCallback((emblaApi) => {
    tweenFactor.current = TWEEN_FACTOR_BASE * emblaApi.scrollSnapList().length;
  }, []);

  const tweenScale = useCallback((emblaApi, eventName) => {
    const engine = emblaApi.internalEngine();
    const scrollProgress = emblaApi.scrollProgress();
    const slidesInView = emblaApi.slidesInView();
    const isScrollEvent = eventName === "scroll";

    emblaApi.scrollSnapList().forEach((scrollSnap, snapIndex) => {
      let diffToTarget = scrollSnap - scrollProgress;
      const slidesInSnap = engine.slideRegistry[snapIndex];

      slidesInSnap.forEach((slideIndex) => {
        if (isScrollEvent && !slidesInView.includes(slideIndex)) return;

        if (engine.options.loop) {
          engine.slideLooper.loopPoints.forEach((loopItem) => {
            const target = loopItem.target();

            if (slideIndex === loopItem.index && target !== 0) {
              const sign = Math.sign(target);

              if (sign === -1) {
                diffToTarget = scrollSnap - (1 + scrollProgress);
              }
              if (sign === 1) {
                diffToTarget = scrollSnap + (1 - scrollProgress);
              }
            }
          });
        }

        const tweenValue = 1 - Math.abs(diffToTarget * tweenFactor.current);
        const scale = numberWithinRange(tweenValue, 0, 1).toString();
        const tweenNode = tweenNodes.current[slideIndex];
        if (tweenNode) {
          tweenNode.style.transform = `scale(${scale})`;
        }
      });
    });
  }, []);

  // Auto-scroll functionality
  useInterval(() => {
    if (emblaApi) {
      emblaApi.scrollNext();
    }
  }, 3000); // Change slide every 3 seconds

  useEffect(() => {
    if (!emblaApi) return;

    setTweenNodes(emblaApi);
    setTweenFactor(emblaApi);
    tweenScale(emblaApi);

    emblaApi
      .on("reInit", setTweenNodes)
      .on("reInit", setTweenFactor)
      .on("reInit", tweenScale)
      .on("scroll", tweenScale)
      .on("select", tweenScale);
  }, [emblaApi, setTweenNodes, setTweenFactor, tweenScale]);

  return (
    <div className="embla">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container ">
          {slides.map((slide, index) => (
            <div className="embla__slide" key={index}>
              <div className="embla__slide__number relative">
                <Image
                  src={slide.image}
                  alt={`Slide ${index + 1}`}
                  className="object-cover rounded-[.75rem] my-10 sm:mb-0 h-[10rem] sm:h-[15rem] md:h-[25rem]"
                />
                {(slide.title || slide.description) && (
                  <div className="absolute inset-x-0 bottom-[2rem] sm:bottom-0 bg-[#3a3a3a] text-white rounded-b-[.75rem]">
                    {slide.title && (
                      <h3 className="text-[1rem] p-1 sm:p-3 sm:text-[1.2rem] font-bold">
                        {slide.title}
                      </h3>
                    )}
                    {slide.description && (
                      <p className="text-[.6rem] p-3 sm:text-[.8rem]">
                        {slide.description}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmblaCarousel;

EmblaCarousel.propTypes = {
  slides: PropTypes.array,
  banner: PropTypes.bool,
  options: PropTypes.object,
};
