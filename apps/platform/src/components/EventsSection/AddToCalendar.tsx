import {
  CalendarPlusIcon,
  DownloadSimpleIcon,
  GoogleLogoIcon,
  MicrosoftOutlookLogoIcon,
} from "@phosphor-icons/react/ssr";
import { buttonVariants } from "~/ui/button";

/**
 * Add one meeting to a calendar (`event-detail.html`): the main button takes
 * the reader to Google Calendar, and the row under it offers Google, Outlook
 * and the `.ics` for everything else. Plain links, so it renders on the server
 * and works without script. No RSVP exists; this is how a meeting gets onto a
 * calendar.
 */
export default function AddToCalendar({
  googleUrl,
  outlookUrl,
  icsUrl,
}: {
  googleUrl: string;
  outlookUrl: string;
  icsUrl: string;
}) {
  return (
    <div className="ev-addcal">
      <span className="btn-shadow">
        <a
          className={buttonVariants({
            variant: "default",
            size: "lg",
            className: "w-full",
          })}
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <CalendarPlusIcon weight="bold" aria-hidden />
          Add to calendar
        </a>
      </span>
      <div className="ev-acts-row">
        <a
          className="btn ghost sm"
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GoogleLogoIcon weight="bold" aria-hidden />
          Google
        </a>
        <a
          className="btn ghost sm"
          href={outlookUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MicrosoftOutlookLogoIcon weight="bold" aria-hidden />
          Outlook
        </a>
        <a className="btn ghost sm" href={icsUrl} download>
          <DownloadSimpleIcon weight="bold" aria-hidden />
          .ics
        </a>
      </div>
    </div>
  );
}
