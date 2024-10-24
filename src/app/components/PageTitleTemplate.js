import PropTypes from "prop-types";

PageTitleTemplate.propTypes = {
  redText: PropTypes.string,
  blackText: PropTypes.string,
  className: PropTypes.string,
  reverse: PropTypes.bool,
};

export default function PageTitleTemplate({
  redText,
  blackText,
  className = "",
  reverse = false,
}) {
  return (
    <div className={`text-center my-[4rem] ${className}`}>
      {reverse ? (
        <>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4.5rem] text-MidnightBlue">
            {blackText}
          </h2>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4.5rem] text-GloryGloryRed">
            {redText}
          </h2>
        </>
      ) : (
        <>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4.5rem] text-GloryGloryRed">
            {redText}
          </h2>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4.5rem] text-MidnightBlue">
            {blackText}
          </h2>
        </>
      )}
    </div>
  );
}
