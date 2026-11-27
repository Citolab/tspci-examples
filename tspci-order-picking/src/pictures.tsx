/*
 * Simple pictures of the products (40 × 40), drawn on the label of a cardboard box. They help a pupil recognise a
 * product, but never alone: the description and the article number are always written next to them.
 */
import type { JSX } from "preact";
import type { Picture } from "./picking";

const INK = "#1f2937";
const line = { fill: "none", stroke: INK, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;
const shape = (fill: string) => ({ fill, stroke: INK, "stroke-width": 2, "stroke-linejoin": "round" }) as const;

const DRAWINGS: Record<Picture, JSX.Element> = {
  paper: (
    <>
      <rect x="9" y="11" width="22" height="22" rx="1" {...shape("#ffffff")} />
      <rect x="7" y="8" width="22" height="22" rx="1" {...shape("#ffffff")} />
      <path d="M11 14h14M11 18h14M11 22h10" {...line} stroke-width="1.5" />
      <rect x="7" y="25" width="22" height="5" {...shape("#56b4e9")} />
    </>
  ),
  pen: (
    <>
      <path d="M10 31l3-8 15-15 5 5-15 15z" {...shape("#0072b2")} />
      <path d="M10 31l3-8 5 5z" {...shape("#f0e442")} />
      <path d="M25 11l5 5" {...line} />
    </>
  ),
  marker: (
    <>
      <rect x="15" y="12" width="10" height="22" rx="2" {...shape("#ffffff")} />
      <rect x="15" y="5" width="10" height="9" rx="2" {...shape("#009e73")} />
      <path d="M17 34v2h6v-2" {...line} />
    </>
  ),
  glue: (
    <>
      <rect x="13" y="13" width="14" height="22" rx="2" {...shape("#f0e442")} />
      <rect x="14" y="5" width="12" height="9" rx="2" {...shape("#d55e00")} />
      <path d="M17 22h6" {...line} />
    </>
  ),
  notebook: (
    <>
      <rect x="10" y="6" width="22" height="28" rx="2" {...shape("#cc79a7")} />
      <path d="M7 11h6M7 17h6M7 23h6M7 29h6" {...line} />
      <rect x="16" y="12" width="12" height="6" rx="1" {...shape("#ffffff")} stroke-width="1.5" />
    </>
  ),
  binder: (
    <>
      <rect x="9" y="5" width="22" height="30" rx="2" {...shape("#0072b2")} />
      <rect x="12" y="9" width="8" height="12" rx="1" {...shape("#ffffff")} stroke-width="1.5" />
      <circle cx="16" cy="28" r="2.5" {...shape("#ffffff")} stroke-width="1.5" />
    </>
  ),
  scissors: (
    <>
      <circle cx="12" cy="29" r="4.5" {...shape("#d55e00")} />
      <circle cx="26" cy="29" r="4.5" {...shape("#d55e00")} />
      <path d="M14 25L28 6M24 25L10 6" {...line} stroke-width="2.5" />
    </>
  ),
  roll: (
    <>
      <path d="M8 12v18c0 2.5 5.4 4 12 4s12-1.5 12-4V12" {...shape("#ffffff")} />
      <ellipse cx="20" cy="12" rx="12" ry="4" {...shape("#ffffff")} />
      <ellipse cx="20" cy="12" rx="3.5" ry="1.4" {...shape("#e69f00")} stroke-width="1.5" />
    </>
  ),
  towel: (
    <>
      <path d="M7 14h26v7H7z" {...shape("#56b4e9")} />
      <path d="M7 21h26v7H7z" {...shape("#ffffff")} />
      <path d="M7 28h26v6H7z" {...shape("#56b4e9")} />
      <path d="M12 10h16l5 4H7z" {...shape("#ffffff")} />
    </>
  ),
  bottle: (
    <>
      <path d="M13 17c0-2 2-4 4-4h6c2 0 4 2 4 4v16c0 1-1 2-2 2H15c-1 0-2-1-2-2z" {...shape("#009e73")} />
      <path d="M18 13V8h4v5M22 8h6" {...line} />
      <rect x="15" y="21" width="10" height="8" rx="1" {...shape("#ffffff")} stroke-width="1.5" />
    </>
  ),
  spray: (
    <>
      <path d="M12 19c0-2 2-4 4-4h6c2 0 4 2 4 4v14c0 1-1 2-2 2H14c-1 0-2-1-2-2z" {...shape("#e69f00")} />
      <path d="M16 15v-5h8l5 3h-5v2" {...shape("#ffffff")} />
      <path d="M31 9l3-2M31 13h3M31 17l3 2" {...line} stroke-width="1.5" />
    </>
  ),
  gloves: (
    <path
      d="M13 34V20l-4-5c-1-1.5 1-3.5 2.5-2l3.5 4V8c0-2 3-2 3 0v8-10c0-2 3-2 3 0v10-9c0-2 3-2 3 0v9-6c0-2 3-2 3 0v14c0 4-2 6-4 7v3z"
      {...shape("#56b4e9")}
    />
  ),
  bag: (
    <>
      <path d="M10 15c0-2 1-3 3-3h14c2 0 3 1 3 3l2 17c0 2-1 3-3 3H11c-2 0-3-1-3-3z" {...shape("#4b5563")} />
      <path d="M16 12l4-6 4 6" {...line} />
    </>
  ),
  cup: (
    <>
      <path d="M10 10h20l-3 24H13z" {...shape("#ffffff")} />
      <path d="M11.5 18h17" {...line} stroke-width="1.5" />
      <path d="M14 6c0 2 2 2 2 4M20 5c0 2 2 2 2 4" {...line} stroke-width="1.5" />
    </>
  ),
  battery: (
    <>
      <rect x="9" y="12" width="22" height="18" rx="2" {...shape("#e69f00")} />
      <rect x="31" y="17" width="3" height="8" {...shape(INK)} />
      <path d="M14 21h5M16.5 18.5v5M23 21h4" {...line} />
    </>
  ),
  tape: (
    <>
      <circle cx="20" cy="20" r="12" {...shape("#f0e442")} />
      <circle cx="20" cy="20" r="5" {...shape("#ffffff")} />
      <path d="M32 20h4v5" {...line} />
    </>
  ),
  box: (
    <>
      <path d="M8 15l12-6 12 6v14l-12 6-12-6z" {...shape("#ffffff")} />
      <path d="M8 15l12 6 12-6M20 21v14" {...line} />
    </>
  ),
};

/** The picture of a product on its own. */
export const ProductPicture = ({ picture, size = 40 }: { picture: Picture; size?: number }) => (
  <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false" className="shrink-0">
    {DRAWINGS[picture] ?? DRAWINGS.box}
  </svg>
);

/** A cardboard box with a white label: the picture and the article number, as on a shelf. */
export const ProductBox = ({ picture, article, size = 64 }: { picture: Picture; article: string; size?: number }) => (
  <svg viewBox="0 0 64 56" width={size} height={(size * 56) / 64} aria-hidden="true" focusable="false" className="shrink-0">
    <path d="M3 10h58v42a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#d9a066" stroke="#7c4a1e" stroke-width="2" />
    <path d="M3 10l5-7h48l5 7" fill="#e8b98a" stroke="#7c4a1e" stroke-width="2" stroke-linejoin="round" />
    <path d="M32 3v7" stroke="#7c4a1e" stroke-width="2" />
    <rect x="11" y="14" width="42" height="36" rx="3" fill="#ffffff" stroke="#7c4a1e" stroke-width="1.5" />
    <g transform="translate(20 14.5) scale(0.6)">{DRAWINGS[picture] ?? DRAWINGS.box}</g>
    <text x="32" y="47.5" text-anchor="middle" font-size="8.5" font-weight="700" fill={INK} font-family="system-ui, sans-serif">
      {article}
    </text>
  </svg>
);
