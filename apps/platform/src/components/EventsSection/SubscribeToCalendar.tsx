import {
  CalendarPlusIcon,
  DownloadSimpleIcon,
  GoogleLogoIcon,
  MicrosoftOutlookLogoIcon,
} from "@phosphor-icons/react/ssr";
import { Card } from "~/ui/card";

/**
 * The calendar feed card (`events.html`, "Calendar feed"): one feed with every
 * meeting, which the calendar app keeps current. Three ways in (Google,
 * Outlook, or the `.ics` for Apple and the rest) and the `curl` line a terminal
 * reader would use. All plain links, so nothing here needs script.
 */
export default function SubscribeToCalendar({ feedUrl }: { feedUrl: string }) {
  const url = new URL(feedUrl);
  const webcal = `webcal://${url.host}${url.pathname}`;
  const google = `https://calendar.google.com/calendar/r?cid=${webcal}`;
  const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}`;

  return (
    <Card flat={false} className="ev-feed" id="calendar">
      <div className="card-head">
        <CalendarPlusIcon weight="bold" aria-hidden className="ev-feed-icon" />
        <h3 className="card-title">Calendar feed</h3>
      </div>
      <p className="small muted">
        One feed with every meeting. It updates itself, so changes and
        cancellations reach your calendar.
      </p>
      <div className="col ev-feed-links">
        <a
          className="btn secondary sm"
          href={google}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GoogleLogoIcon weight="bold" aria-hidden />
          Google Calendar
        </a>
        <a
          className="btn secondary sm"
          href={outlook}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MicrosoftOutlookLogoIcon weight="bold" aria-hidden />
          Outlook
        </a>
        <a className="btn secondary sm" href={url.pathname} download>
          <DownloadSimpleIcon weight="bold" aria-hidden />
          Download .ics (Apple and others)
        </a>
      </div>
      <a className="btn terminal sm ev-curl" href={url.pathname}>
        <b>$</b> curl {url.host}
        {url.pathname}
      </a>
    </Card>
  );
}
