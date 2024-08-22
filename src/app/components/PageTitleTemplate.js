/* eslint-disable react/prop-types */

export default function PageTitleTemplate({
  redText,
  blackText,
  className = "",
  reverse = false,
  children,
}) {
  return (
    <div className={`text-center my-[4rem] ${className}`}>
      {reverse ? (
        <>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">
            {blackText}
          </h2>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] text-UGASecondary">
            {redText}
          </h2>
        </>
      ) : (
        <>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] text-UGASecondary">
            {redText}
          </h2>
          <h2 className="font-bold inline text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">
            {blackText}
          </h2>
        </>
      )}
      {children && <div>{children}</div>}
    </div>
  );
}
