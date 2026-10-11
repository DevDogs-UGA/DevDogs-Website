import * as React from "react";
import type { ReactElement } from "react";
import {
  DOGDAYS_MARK,
  DOGPACK_MARK,
  type MarkData,
  type MarkNode,
} from "./marks-data.js";

/**
 * The two app marks as tintable JSX, drawn from the one copy of the geometry
 * in `marks-data.ts`. `color` is the caller's decision: an app icon wants the
 * mark in black on its own saturated ground, the rule the switcher tiles
 * follow. Works under React DOM and Satori both.
 */

/** `stroke-width` → `strokeWidth`; the few SVG attributes React renames. */
function reactAttrs(
  attrs: MarkNode["attrs"],
  color: string,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(attrs).map(([name, value]) => [
      name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value === "currentColor" ? color : value,
    ]),
  );
}

function element(node: MarkNode, color: string, key: number): ReactElement {
  return React.createElement(
    node.tag,
    { key, ...reactAttrs(node.attrs, color) },
    ...(node.children?.map((child, i) => element(child, color, i)) ?? []),
  );
}

function Mark({
  data,
  size,
  color,
}: {
  data: MarkData;
  size: number;
  color: string;
}) {
  return (
    <svg width={size} height={size} viewBox={data.viewBox}>
      {data.nodes.map((node, i) => element(node, color, i))}
    </svg>
  );
}

/** DogDays: a wall calendar with a bone pinned to it. */
export function DogDaysMark({ size, color }: { size: number; color: string }) {
  return <Mark data={DOGDAYS_MARK} size={size} color={color} />;
}

/** DogPack: one bold paw, four pads gathered around a center. */
export function DogPackMark({ size, color }: { size: number; color: string }) {
  return <Mark data={DOGPACK_MARK} size={size} color={color} />;
}
