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
          <h2 className="inline text-[2rem] font-[600] text-MidnightBlue md:text-[3rem] lg:text-[3.5rem]">
            {blackText}
          </h2>
          <h2 className="inline text-[2rem] font-[600] text-BulldogRed md:text-[3rem] lg:text-[3.5rem]">
            {redText}
          </h2>
        </>
      ) : (
        <>
          <h2 className="inline text-[2rem] font-[600] text-BulldogRed md:text-[3rem] lg:text-[3.5rem]">
            {redText}
          </h2>
          <h2 className="inline text-[2rem] font-[600] text-MidnightBlue md:text-[3rem] lg:text-[3.5rem]">
            {blackText}
          </h2>
        </>
      )}
    </div>
  );
}
