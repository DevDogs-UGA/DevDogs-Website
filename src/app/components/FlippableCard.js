import Image from "next/image";
import Link from "next/link";
import PropTypes from "prop-types";

FlippableCard.propTypes = {
  image: PropTypes.string.isRequired,
};

export default function FlippableCard(props) {
  return (
    <div className="flex place-content-center">
      <div className="group h-[25rem] w-[20rem] cursor-pointer rounded-3xl bg-black bg-transparent perspective-1000">
        <div className="relative h-full w-full duration-500 preserve-3d group-hover:rotate-y-180">
          <div className="absolute overflow-hidden rounded-3xl backface-hidden">
            <Image src={props.image} className="h-full w-full" />
          </div>
          <div className="absolute h-full w-full space-y-5 overflow-hidden rounded-3xl bg-black bg-opacity-75 text-white rotate-y-180 backface-hidden">
            <div className="mt-10 text-center">
              <span className="text-3xl font-extrabold"> test</span>
            </div>
            <div className="mt-10 text-center">
              <span className="text-xl font-semibold"> test test</span>
            </div>

            <div className="mt-10 text-center">
              <Link target="_blank" href={"www.github.com"}>
                Github
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
