/**
 * The two app marks as plain data: the one copy of their path geometry.
 *
 * `marks.tsx` draws it as React (DOM and Satori alike), `markSvg` below draws
 * it as a string, and the slides' Vue components take the same string through
 * `v-html`. Nothing here imports React, so a Vue or CLI consumer takes the
 * `@devdogsuga/brand/marks` subpath without it.
 *
 * Geometry is drawn against Alan Sans' metrics: 0.15em strokes, round-capped
 * terminals, square outer corners, so a mark sits in a line of the club's
 * display face as a letter would. Every paint is `currentColor`; the caller
 * decides the colour.
 */
export interface MarkNode {
  tag: "path" | "line" | "rect" | "circle" | "ellipse" | "g";
  /** SVG attribute names, kebab-case as they are written in a `.svg` file. */
  attrs: Readonly<Record<string, string | number>>;
  children?: readonly MarkNode[];
}

export interface MarkData {
  viewBox: string;
  nodes: readonly MarkNode[];
}

const FILL = { fill: "currentColor" } as const;

/** DogDays: a wall calendar with a bone pinned to it. */
export const DOGDAYS_MARK: MarkData = {
  viewBox: "2.5 3.5 43 43",
  nodes: [
    // Header band, notched where the tabs pass through it.
    {
      tag: "path",
      attrs: {
        d: "M 7.5 9.5 H 11.8 V 13.95 Q 11.8 15.45 13.3 15.45 H 17.7 Q 19.2 15.45 19.2 13.95 V 9.5 H 28.8 V 13.95 Q 28.8 15.45 30.3 15.45 H 34.7 Q 36.2 15.45 36.2 13.95 V 9.5 H 40.5 Q 45.5 9.5 45.5 14.5 V 18.25 H 2.5 V 14.5 Q 2.5 9.5 7.5 9.5 Z",
        ...FILL,
      },
    },
    // Frame: walls and floor, one stroke wide, butt-ended under the band.
    {
      tag: "path",
      attrs: {
        d: "M 5 17.75 V 41.5 Q 5 44 7.5 44 H 40.5 Q 43 44 43 41.5 V 17.75",
        stroke: "currentColor",
        "stroke-width": 5,
        fill: "none",
        "stroke-linecap": "butt",
      },
    },
    // Fillets easing the floor into the walls, inside the frame.
    {
      tag: "path",
      attrs: { d: "M 40.5 39 Q 40.5 41.5 38 41.5 L 40.5 41.5 Z", ...FILL },
    },
    {
      tag: "path",
      attrs: { d: "M 7.5 39 Q 7.5 41.5 10 41.5 L 7.5 41.5 Z", ...FILL },
    },
    // Binder tabs: round-capped capsules, like Alan Sans arm terminals.
    {
      tag: "g",
      attrs: {
        stroke: "currentColor",
        "stroke-width": 5,
        "stroke-linecap": "round",
      },
      children: [
        { tag: "line", attrs: { x1: 15.5, y1: 6, x2: 15.5, y2: 11.75 } },
        { tag: "line", attrs: { x1: 32.5, y1: 6, x2: 32.5, y2: 11.75 } },
      ],
    },
    // The bone, tilted a little so it reads as pinned rather than printed.
    {
      tag: "g",
      attrs: {
        transform: "translate(24 29.88) rotate(-14) translate(-24 -27)",
        ...FILL,
      },
      children: [
        {
          tag: "rect",
          attrs: { x: 16.5, y: 24.8, width: 15, height: 4.4, rx: 2.2 },
        },
        { tag: "circle", attrs: { cx: 16.5, cy: 24.9, r: 3.1 } },
        { tag: "circle", attrs: { cx: 16.5, cy: 29.1, r: 3.1 } },
        { tag: "circle", attrs: { cx: 31.5, cy: 24.9, r: 3.1 } },
        { tag: "circle", attrs: { cx: 31.5, cy: 29.1, r: 3.1 } },
      ],
    },
  ],
};

/** DogPack: one bold paw, four pads gathered around a center. */
export const DOGPACK_MARK: MarkData = {
  viewBox: "5.07 9.42 37.86 31.18",
  nodes: [
    {
      tag: "g",
      attrs: FILL,
      children: [
        {
          tag: "path",
          attrs: {
            d: "M 24 24.6 C 28.6 24.6 34 26.8 34.8 31.6 C 35.5 36.4 30.8 40.6 24 40.6 C 17.2 40.6 12.5 36.4 13.2 31.6 C 14 26.8 19.4 24.6 24 24.6 Z",
          },
        },
        {
          tag: "ellipse",
          attrs: {
            cx: 18,
            cy: 15,
            rx: 4.4,
            ry: 5.6,
            transform: "rotate(-8 18 15)",
          },
        },
        {
          tag: "ellipse",
          attrs: {
            cx: 30,
            cy: 15,
            rx: 4.4,
            ry: 5.6,
            transform: "rotate(8 30 15)",
          },
        },
        {
          tag: "ellipse",
          attrs: {
            cx: 9.6,
            cy: 22.6,
            rx: 4.2,
            ry: 5.4,
            transform: "rotate(-30 9.6 22.6)",
          },
        },
        {
          tag: "ellipse",
          attrs: {
            cx: 38.4,
            cy: 22.6,
            rx: 4.2,
            ry: 5.4,
            transform: "rotate(30 38.4 22.6)",
          },
        },
      ],
    },
  ],
};

export const MARKS = { dogdays: DOGDAYS_MARK, dogpack: DOGPACK_MARK } as const;
export type MarkName = keyof typeof MARKS;

function nodeSvg(node: MarkNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
  return node.children
    ? `<${node.tag}${attrs}>${node.children.map(nodeSvg).join("")}</${node.tag}>`
    : `<${node.tag}${attrs}/>`;
}

/**
 * The mark's shapes as markup, without the `<svg>` around them: for a Vue
 * component that owns the `<svg>` element (its size, class, `aria-hidden`) and
 * only wants the geometry, through `v-html`. Paint stays `currentColor` unless
 * `color` is given.
 */
export function markBody(name: MarkName, color?: string): string {
  const body = MARKS[name].nodes.map(nodeSvg).join("");
  return color ? body.replaceAll("currentColor", color) : body;
}

/**
 * The mark as an `<svg>` string.
 *
 * With no `color` the paint stays `currentColor`, so the surrounding CSS
 * `color` tints it. `size` omitted leaves the width and height to CSS.
 */
export function markSvg(
  name: MarkName,
  { color, size }: { color?: string; size?: number } = {},
): string {
  const dims = size === undefined ? "" : ` width="${size}" height="${size}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg"${dims} viewBox="${MARKS[name].viewBox}">${markBody(name, color)}</svg>`;
}
