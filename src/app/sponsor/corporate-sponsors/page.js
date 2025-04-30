import PageTitleTemplate from "@/app/components/PageTitleTemplate";
import Link from "next/link";

function getCurrentSponsors(tier) {
  //todo: have function call backend and get list of sponsors
  console.log(tier); //to pass eslint checks
  let numSponsors = 0; //would get this from backend
  if (numSponsors === 0) {
    return (
      <>
        <div className="font-bold text-[1.5rem] md:text-[2.5rem] lg:text-[3.5rem] text-[#AA999D]">
          None Yet
        </div>
        <Link
          href="#"
          className="underline text-[#01A2AD] text-[0.8rem] md:text-[1rem] lg:text-[1.2rem]"
        >
          Become our first!
        </Link>
        {/* link for some reason not showing up as regular hyper link so quick work around with underline and blue color */}
      </>
    );
  } else {
    //todo: when backend up
    return <div>backend not up yet</div>;
  }
}

function sponsorList() {
  let tiers = ["Platinum", "Gold", "Silver", "Bronze"];
  return (
    <>
      {tiers.map((tier) => {
        return (
          <div key={tier} className="">
            <div className="font-bold text-[1.25rem] md:text-[2.25rem] lg:text-[3.25rem] flex justify-center flex-row items-center whitespace-normal">
              <div
                id={tier.toLowerCase()}
                className="size-3 md:size-5 lg:size-8 rounded-full m-1 md:m-2 lg:m-3"
              ></div>{" "}
              {/* ^circle */}
              {tier}
            </div>
            <div className="flex flex-col justify-center items-center">
              {getCurrentSponsors(tier)}
            </div>
            <br></br>
            <br></br>
          </div>
        );
      })}
    </>
  );
}

export default function CorporateSponsors() {
  return (
    <div className="flex flex-col section section-sponsor size-full page-main-side-padding">
      <PageTitleTemplate
        redText={"Sponsors"}
        blackText={"Corporate "}
        reverse={true}
      />

      <div className="flex justify-center font-bold text-[1.5rem] md:text-[2.5rem] lg:text-[3.5rem]">
        Thank &nbsp; {/*&nbsp; is a space character*/}
        <h2 className="text-UGASecondary">You</h2>
      </div>

      <p className="text-center text-[1rem] md:text-[1.2rem] lg:text-[1.5rem]">
        DevDogs is extremely thankful for the support of out sponsors below.
        Their generous contributions are imperative to DevDogs&apos; success in
        its mission to build software with a purpose at the scale of what we do.
      </p>
      <br></br>
      {sponsorList()}

      <div className="flex flex-row justify-center ">
        <div className="font-bold text-[1.25rem] md:text-[2.25rem] lg:text-[3.25rem] mr-2 ">
          Want your name here?
        </div>
        <button className="rounded-full  bg-[#BA0C2F] text-white border px-4 py-0 ml-2 text-[0.8rem] md:text-[1rem] lg:text-[1.3rem]">
          Help Us Out
        </button>
      </div>
    </div>
  );
}
