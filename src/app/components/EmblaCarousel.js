"use client";
import { useCallback, useEffect, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import Link from "next/link";
import "./embla.css";
import PropTypes from "prop-types";

const TWEEN_FACTOR_BASE = 0.2;

const numberWithinRange = (number, min, max) =>
  Math.min(Math.max(number, min), max);

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

  useInterval(() => {
    if (emblaApi) {
      emblaApi.scrollNext();
    }
  }, 4500);

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
        <div className="embla__container">
          {slides.map((slide, index) => (
            <div className="embla__slide" key={index}>
              {slide.link ? (
                <Link href={slide.link} target="_blank">
                  <div className="embla__slide__number relative">
                    {slide.image && (
                      <Image
                        src={slide.image}
                        alt={`Slide ${index + 1}`}
                        className="my-10 h-[10rem] rounded-[.75rem] object-cover sm:mb-0 sm:h-[15rem] md:h-[25rem]"
                      />
                    )}
                    {(slide.title || slide.description) && (
                      <div className="absolute inset-x-0 bottom-[2rem] hidden rounded-b-[.75rem] bg-black/[.65] text-white sm:bottom-0 md:block">
                        {slide.title && (
                          <h3 className="p-1 text-[1rem] font-bold sm:p-3 sm:text-[1.5rem]">
                            {slide.title}
                          </h3>
                        )}
                        {slide.description && (
                          <p className="px-[1rem] pb-[1rem] text-center text-[.5rem] sm:text-[1rem]">
                            {slide.description}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              ) : (
                <div className="embla__slide__number relative">
                  {slide.image && (
                    <Image
                      src={slide.image}
                      alt={`Slide ${index + 1}`}
                      className="my-10 h-[10rem] rounded-[.75rem] object-cover sm:mb-0 sm:h-[15rem] md:h-[25rem]"
                    />
                  )}
                  {(slide.title || slide.description) && (
                    <div className="absolute inset-x-0 bottom-[2rem] rounded-b-[.75rem] bg-black/[.65] text-white sm:bottom-0">
                      {slide.title && (
                        <h3 className="hidden p-1 text-[1rem] font-bold sm:p-3 sm:text-[1.5rem] md:block">
                          {slide.title}
                        </h3>
                      )}
                      {slide.description && (
                        <p className="hidden p-3 text-center text-[.6rem] sm:text-[.8rem] md:block">
                          {slide.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

EmblaCarousel.propTypes = {
  slides: PropTypes.arrayOf(
    PropTypes.shape({
      image: PropTypes.string.isRequired,
      title: PropTypes.string,
      description: PropTypes.string,
      link: PropTypes.string,
    }),
  ),
  options: PropTypes.object,
};

export default EmblaCarousel;
