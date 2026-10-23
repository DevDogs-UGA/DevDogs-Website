"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsOutIcon,
  ProhibitIcon,
  SunIcon,
  WifiSlashIcon,
} from "@phosphor-icons/react/ssr";
import { QR_DEFAULTS, renderQrSvg } from "@devdogsuga/sdk/brand/qr";
import "./display.css";
import TitleCard, {
  CHECK_IN_ADDRESS,
  type TitleCardMeeting,
} from "./TitleCard";
import { useAttendanceCodes } from "./useAttendanceCodes";

/** Advances from the title card to the code, presenter-remote-friendly. */
const ADVANCE_KEYS = new Set([
  " ",
  "Spacebar",
  "ArrowRight",
  "Enter",
  "PageDown",
]);
/** Reverses from the code back to the title card. */
const BACK_KEYS = new Set(["ArrowLeft", "Backspace", "PageUp"]);

export default function AttendanceDisplay({
  meetingId,
  canceled,
  meeting,
  present = false,
}: {
  meetingId: string;
  canceled: boolean;
  /** Everything the opening title card needs -- see `TitleCard`'s doc. */
  meeting: TitleCardMeeting;
  /**
   * Renders edge-to-edge at the viewport instead of as a bordered card
   * inside the console page -- for the `(present)` route a popup opened via
   * `OpenDisplayLink` lands on, which has no site chrome around it to be a
   * card inside of. The slide itself looks the same either way: it scales
   * with its box.
   */
  present?: boolean;
}) {
  const screen = useRef<HTMLDivElement>(null);
  // Whether the screen lock is held right now; the officer at the laptop sees
  // it in the hover controls. Null until the first request settles.
  const [awake, setAwake] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState(!canceled);
  // The display opens on the title card, not the code: revealing it is a
  // deliberate act (a key press or a click), and the 30-second code window
  // has to start there, not at page load. See `useAttendanceCodes`.
  const [revealed, setRevealed] = useState(false);

  const advance = useCallback(() => setRevealed(true), []);
  const back = useCallback(() => setRevealed(false), []);

  // Presenter-remote-friendly: a remote sends key events to the page
  // regardless of what has focus, so this listens on the window rather than
  // requiring the title card itself to be focused.
  useEffect(() => {
    if (!confirmed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (ADVANCE_KEYS.has(event.key)) {
        event.preventDefault();
        advance();
      } else if (BACK_KEYS.has(event.key)) {
        event.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmed, advance, back]);

  const { payload, drainDelay, error, now } = useAttendanceCodes({
    meetingId,
    canceled,
    enabled: confirmed && revealed,
  });

  // This screen gets projected and left unattended, so keep the display from
  // sleeping while it's open. The lock is released whenever the tab is hidden,
  // hence the re-request on visibilitychange.
  useEffect(() => {
    if (!confirmed || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    const acquire = () => {
      void navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (disposed) {
            void sentinel.release();
            return;
          }
          lock = sentinel;
          setAwake(true);
          sentinel.addEventListener("release", () => setAwake(false));
        })
        .catch(() => setAwake(false));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [confirmed]);

  // Black modules on a white square, the same on a projector as on a phone
  // screen held up to it: white-on-dark codes fail on dim projectors.
  const qr = useMemo(
    () =>
      payload
        ? renderQrSvg(
            payload.url,
            {
              ...QR_DEFAULTS,
              color: "#0b0720",
              background: "#ffffff",
              margin: 3,
            },
            "/brand/devdog.svg",
          )
        : null,
    [payload],
  );
  const remaining = payload
    ? Math.max(0, Math.ceil((payload.expiresAt - now) / 1_000))
    : 0;
  const low = remaining <= 5;

  if (!confirmed) {
    return (
      <div
        className={
          present
            ? "relative flex h-dvh w-full flex-col overflow-hidden bg-[#0b0720]"
            : "relative flex h-[36rem] flex-col overflow-hidden bg-[#0b0720]"
        }
      >
        <div className="disp-region">
          <div className="disp-stage" style={{ cursor: "default" }}>
            <div className="disp-cancel" role="alert">
              <div
                style={{
                  display: "flex",
                  gap: "1.25cqw",
                  alignItems: "center",
                }}
              >
                <ProhibitIcon
                  weight="bold"
                  aria-hidden
                  style={{ fontSize: "5.7292cqw", color: "#ff9aa8" }}
                />
                <h2>This meeting is canceled</h2>
              </div>
              <p>
                Canceled in the schedule. Member check-in rejects a canceled
                meeting, so nobody can check in with these codes unless an
                officer deliberately opens this display.
              </p>
              <button
                type="button"
                className="gate"
                onClick={() => setConfirmed(true)}
              >
                Show codes anyway
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={screen}
      // `h-[36rem]`/`h-dvh`, never `min-h`: the slide sizes itself in
      // container query units off the region below, and a size container
      // needs a *specified* height to measure. A `min-height` doesn't count
      // as one -- the region, and the slide in it, would collapse to 0.
      className={
        present
          ? "disp-wrap relative isolate flex h-dvh w-full flex-col overflow-hidden bg-[#0b0720]"
          : "disp-wrap fullscreen:h-screen fullscreen:border-0 relative isolate flex h-[36rem] flex-col overflow-hidden border-2 border-white/15 bg-[#0b0720]"
      }
    >
      <div className="disp-region">
        <TitleCard
          meeting={meeting}
          onReveal={advance}
          qr={
            !revealed ? (
              <p className="disp-qr-empty m-0 size-full">
                <span>
                  Space, → or Enter
                  <br />
                  to show the check-in code
                </span>
              </p>
            ) : error ? (
              <p
                className="disp-qr-empty disp-qr-err m-0 size-full"
                role="alert"
              >
                QR paused
              </p>
            ) : !payload || !qr ? (
              <p className="disp-qr-empty m-0 size-full">
                Preparing attendance codes…
              </p>
            ) : (
              <div
                role="img"
                aria-label="QR code that opens the check-in page"
                className="size-full [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            )
          }
          right={
            <>
              {!revealed ? (
                <div
                  className="disp-a disp-meta"
                  style={{ left: "40cqw", top: "26cqw", fontSize: "2.2917cqw" }}
                >
                  The code and the QR appear together.
                </div>
              ) : error ? (
                <>
                  <div
                    className="disp-a disp-bigerr"
                    style={{ left: "40cqw", top: "25cqw", width: "52cqw" }}
                    role="alert"
                  >
                    Codes paused.
                    <br />
                    Hang on.
                  </div>
                  <div
                    className="disp-a disp-erradv"
                    style={{ left: "40cqw", top: "40cqw", width: "52cqw" }}
                  >
                    Check-in is back in a moment. An officer is on it.
                  </div>
                </>
              ) : payload ? (
                <>
                  <div
                    className="disp-a disp-step"
                    style={{ left: "40cqw", top: "21.8cqw" }}
                  >
                    <b aria-hidden>2</b>Then type this code
                  </div>
                  <div
                    className="disp-a disp-code"
                    style={{ left: "40cqw", top: "26cqw" }}
                    aria-label={`Check-in code ${payload.code.slice(0, 3)} ${payload.code.slice(3)}`}
                  >
                    <span>{payload.code.slice(0, 3)}</span>
                    <span>{payload.code.slice(3)}</span>
                  </div>
                  <div
                    className="disp-a disp-bar"
                    data-low={low}
                    style={{
                      left: "40cqw",
                      top: "39.4cqw",
                      width: "46.875cqw",
                      height: "1.25cqw",
                    }}
                  >
                    <i
                      key={payload.expiresAt}
                      style={{
                        animation: "attendance-drain 30s linear forwards",
                        animationDelay: `${drainDelay}ms`,
                      }}
                    />
                  </div>
                  <div
                    className="disp-a disp-meta"
                    data-low={low}
                    style={{
                      left: "40cqw",
                      top: "41.4cqw",
                      fontSize: "1.9792cqw",
                    }}
                  >
                    New code in <b>{remaining} s</b> · the last code still works
                    until then
                  </div>
                </>
              ) : null}
              <div
                className="disp-a disp-meta"
                style={{ left: "40cqw", top: "46.5cqw", fontSize: "1.9792cqw" }}
              >
                Can’t scan? Go to
              </div>
              <div
                className="disp-a disp-url"
                style={{ left: "40cqw", top: "49.3cqw" }}
              >
                {CHECK_IN_ADDRESS}
              </div>
            </>
          }
          count={
            revealed && payload && !error ? (
              <div
                className="disp-a disp-count"
                style={{ left: "75cqw", top: "4.9cqw" }}
              >
                <i aria-hidden />
                {payload.attendanceCount} checked in
              </div>
            ) : null
          }
        />

        {/* The officer's controls sit over the region's corner and show on
            hover or focus only, so the slide is the whole projector image. */}
        <div className="disp-ctl fullscreen:hidden" data-show={Boolean(error)}>
          {error ? (
            <span className="b no" role="status">
              <WifiSlashIcon weight="bold" aria-hidden />
              Can’t reach the server. Retrying every 5 s
            </span>
          ) : awake === true ? (
            <span className="b ok">
              <SunIcon weight="bold" aria-hidden />
              Screen kept awake
            </span>
          ) : awake === false ? (
            <span className="b no">
              <SunIcon weight="bold" aria-hidden />
              Screen may sleep
            </span>
          ) : null}
          <button
            type="button"
            className="b"
            onClick={() => void screen.current?.requestFullscreen()}
          >
            <ArrowsOutIcon weight="bold" aria-hidden /> Full screen
          </button>
        </div>
      </div>
    </div>
  );
}
