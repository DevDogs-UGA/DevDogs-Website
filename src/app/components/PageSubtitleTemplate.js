import PropTypes from "prop-types";

PageSubtitleTemplate.propTypes = {
  redText: PropTypes.string,
  blackText: PropTypes.string,
  className: PropTypes.string,
  reverse: PropTypes.bool,
};

export default function PageSubtitleTemplate({
  redText,
  blackText,
  className = "",
  reverse = false,
}) {
  return (
    <div className={`${className}`}>
      {reverse ? (
        <>
          <h2 className="font-[600] inline text-[2rem] md:text-[3rem] lg:text-[3.5rem] text-MidnightBlue">
            {blackText}
          </h2>
          <h2 className="font-[600] inline text-[2rem] md:text-[3rem] lg:text-[3.5rem] text-BulldogRed">
            {redText}
          </h2>
        </>
      ) : (
        <>
          <h2 className="font-[600] inline text-[2rem] md:text-[3rem] lg:text-[3.5rem] text-BulldogRed">
            {redText}
          </h2>
          <h2 className="font-[600] inline text-[2rem] md:text-[3rem] lg:text-[3.5rem] text-MidnightBlue">
            {blackText}
          </h2>
        </>
      )}
    </div>
  );
}
