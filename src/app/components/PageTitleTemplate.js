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
    <div className={`my-[4rem] text-center ${className}`}>
      {reverse ? (
        <>
          <h2 className="inline text-[2.5rem] font-bold text-MidnightBlue md:text-[3.5rem] lg:text-[4rem]">
            {blackText}
          </h2>
          <h2 className="inline text-[2.5rem] font-bold text-GloryGloryRed md:text-[3.5rem] lg:text-[4rem]">
            {redText}
          </h2>
        </>
      ) : (
        <>
          <h2 className="inline text-[2.5rem] font-bold text-GloryGloryRed md:text-[3.5rem] lg:text-[4rem]">
            {redText}
          </h2>
          <h2 className="inline text-[2.5rem] font-bold text-MidnightBlue md:text-[3.5rem] lg:text-[4rem]">
            {blackText}
          </h2>
        </>
      )}
    </div>
  );
}
