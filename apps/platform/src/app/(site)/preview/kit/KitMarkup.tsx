"use client";

import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowRightIcon,
  CalendarPlusIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  DotsThreeIcon,
  GearIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  QrCodeIcon,
  SignOutIcon,
  TerminalWindowIcon,
  TrashIcon,
  UserCircleIcon,
  WarningIcon,
  WarningCircleIcon,
  XIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";

const ICONS: Record<string, ComponentType<{ weight: "bold" }>> = {
  ArrowRight: ArrowRightIcon,
  CalendarPlus: CalendarPlusIcon,
  CaretLeft: CaretLeftIcon,
  CaretRight: CaretRightIcon,
  CaretUpDown: CaretUpDownIcon,
  Check: CheckIcon,
  CheckCircle: CheckCircleIcon,
  Clock: ClockIcon,
  Copy: CopyIcon,
  DotsThree: DotsThreeIcon,
  Gear: GearIcon,
  Info: InfoIcon,
  MagnifyingGlass: MagnifyingGlassIcon,
  MapPin: MapPinIcon,
  QrCode: QrCodeIcon,
  SignOut: SignOutIcon,
  TerminalWindow: TerminalWindowIcon,
  Trash: TrashIcon,
  UserCircle: UserCircleIcon,
  Warning: WarningIcon,
  WarningCircle: WarningCircleIcon,
  X: XIcon,
  XCircle: XCircleIcon,
};

/**
 * The mockup page fills these in with chrome.js and a script; here the same
 * substitutions run on the markup string: Phosphor Bold icons inside an
 * `<x-icon>` (the element the kit's rules target), the finish's logo and decor,
 * and root-relative image URLs.
 */
function finishMarkup(html: string, finish: "cosmic" | "paper"): string {
  return html
    .replace(
      /<x-icon name="(\w+)"([^>]*)><\/x-icon>/g,
      (_, name: string, attrs: string) => {
        const Icon = ICONS[name];
        const svg = Icon ? renderToStaticMarkup(<Icon weight="bold" />) : "";
        return `<x-icon${attrs}>${svg}</x-icon>`;
      },
    )
    .replace(
      /<img class="logo logo-dd" alt="DevDogs">/g,
      finish === "cosmic"
        ? '<img class="logo logo-dd" alt="DevDogs" src="/cosmic/a/devdogs-logo-dark.png">'
        : '<img class="logo logo-dd" alt="GDG on Campus UGA" src="/cosmic/a/gdgc-uga-lockup-official.svg">',
    )
    .replace(
      /<img class="sprite deco" data-n="(\w+)" alt="">/g,
      (_, name: string) =>
        finish === "cosmic"
          ? `<img class="sprite deco" alt="" src="/cosmic/a/sprite/${name}.png" style="--w:64px">`
          : `<span class="emoji-badge"><img alt="" src="/cosmic/a/emoji/${name}.svg"></span>`,
    )
    .replace(/url\(img\//g, "url(/cosmic/img/");
}

/** One finish's pane of a group, the mockup's markup with this finish filled in. */
export default function KitMarkup({
  html,
  finish,
  label,
}: {
  html: string;
  finish: "cosmic" | "paper";
  label: string;
}) {
  return (
    <div
      className={`pane ${finish}`}
      data-label={label}
      dangerouslySetInnerHTML={{ __html: finishMarkup(html, finish) }}
    />
  );
}
