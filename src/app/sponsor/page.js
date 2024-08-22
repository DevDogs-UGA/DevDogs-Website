import Link from "next/link";
import SponsorshipCard from "../components/SponsorshipCard";
import PageTitleTemplate from "../components/PageTitleTemplate";

const SponsorNow = () => {
  return (
    <div className="section section-sponsor">
      <div id="sponsortitle">
        <h1>
          <b className="red-bold">Sponsor</b> Now
        </h1>
      </div>
const Page = () =>
{
    return (
        <div className="section section-sponsor flex flex-col h-[70vh]">
            {/* <div id="sponsortitle">
                <h1><b className="red-bold">Sponsor</b> Now</h1>
            </div> */}

            <PageTitleTemplate redText={"Sponsor "} blackText={"Today"} />

      <div id="tiertitle">
        <h2>
          Select a <b className="red-bold"> Tier </b>
        </h2>
      </div>
            {/* <div id="tiertitle">
                <h2>Select a <b className="red-bold"> Tier </b></h2>
            </div> */}

            <div className="text-center my-10">
                <h3 className="font-bold text-4xl text-center inline p-0 m-0">Select Your </h3>
                <h3 className="font-bold text-4xl text-center text-UGASecondary inline p-0 m-0">Teir</h3></div>

            

      <div id="tiers">
        <Link
          target="_blank"
          href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.BRONZE:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts"
          className="hover:drop-shadow-lg"
        >
          <SponsorshipCard id="bronze" tiername="Bronze - $600" />
        </Link>
        <Link
          target="_blank"
          href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.SILVER:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts"
          className="hover:drop-shadow-lg"
        >
          <SponsorshipCard id="silver" tiername="Silver - $1250" />
        </Link>
        <Link
          target="_blank"
          href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.GOLD:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts"
          className="hover:drop-shadow-lg"
        >
          <SponsorshipCard id="gold" tiername="Gold - $2500" />
        </Link>
      </div>
            <div id="tiers">
                <Link target="_blank" href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.BRONZE:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts" className="hover:drop-shadow-lg">
                    <SponsorshipCard id="bronze" tiername="Bronze - $600" />
                </Link>
                <Link target="_blank" href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.SILVER:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts" className="hover:drop-shadow-lg">
                    <SponsorshipCard id="silver" tiername="Silver - $1250" />
                </Link>
                <Link target="_blank" href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.GOLD:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts" className="hover:drop-shadow-lg">
                    <SponsorshipCard id="gold" tiername="Gold - $2500" />
                </Link>
            </div>

      <div id="tiers">
        <Link
          target="_blank"
          href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.PLATINUM:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts"
          className="hover:drop-shadow-lg"
        >
          <SponsorshipCard id="platinum" tiername="Platinum - $5000" />
        </Link>
        <Link
          target="_blank"
          href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.CUSTOM:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts"
          className="hover:drop-shadow-lg"
        >
          <SponsorshipCard id="custom" tiername="Custom Amount" />
        </Link>
      </div>
    </div>
  );
};
            <div id="tiers">
                <Link target="_blank" href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.PLATINUM:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts" className="hover:drop-shadow-lg">
                    <SponsorshipCard id="platinum" tiername="Platinum - $5000" />
                </Link>
                <Link target="_blank" href="https://ugapac.evenue.net/cgi-bin/ncommerce3/SEGetEventInfo?ticketCode=GS:UGAARTS:TATE2425:DON.CUSTOM:&linkID=ta-ugaarts&dataAccId=157&locale=en_US&siteId=ev_ta-ugaarts" className="hover:drop-shadow-lg">
                    <SponsorshipCard id="custom" tiername="Custom Amount" />
                </Link>
            </div>
        </div>
    )
}

export default SponsorNow;

export default Page;