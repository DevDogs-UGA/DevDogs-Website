import Link from "next/link";
import SponsorshipCard from "../components/SponsorshipCard";
import Button from "../components/Button";

const SponsorNow = () => {
  return (
    <div className="section section-sponsor">
      <div id="sponsortitle">
        <h1>
          <b className="red-bold">Sponsor</b> Now
        </h1>
      </div>

      <Link
        target="_blank"
        href="https://drive.google.com/file/d/1YjoK3LXnFSpgfiRmoGg3R9teDsCi1VAL/view?usp=sharing"
      >
        <Button id="sponsorbrochure">Sponsorship Brochure</Button>
      </Link>

      <div id="tiertitle">
        <h2>
          Select a <b className="red-bold"> Tier </b>
        </h2>
      </div>

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

export default SponsorNow;
