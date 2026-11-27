/**
 * The drawings, all made for this PCI in SVG: the worker (three figures with different skin tones and hair, the same
 * friendly pose and plain work clothes), the protective equipment, and a blue mandatory sign per item (a white
 * silhouette of the item on a blue disc; a simple drawn pictogram, not the ISO 7010 artwork).
 *
 * Every item is drawn once, in the coordinates of the worker (viewBox 0 0 240 410), exactly where it sits on the body.
 * On the worker it is drawn as it is; in the rack and in the sign the same drawing is cut out with a viewBox around it
 * (ITEM_BOX). So what the pupil picks is what appears on the worker.
 */
import type { ComponentChildren, JSX } from "preact";
import { ItemId, WorkerId, ZoneId } from "./equipment";

export const FIGURE_BOX = "0 0 240 410";
const SIGN_BLUE = "#1d5fa6";

/** The worker's looks: skin, the shade for its outlines, hair, shirt and trousers. */
export const WORKER_LOOKS: Record<WorkerId, { skin: string; skinLine: string; hair: string; shirt: string; trousers: string; style: 1 | 2 | 3 }> = {
  1: { skin: "#f2c8a5", skinLine: "#b9805a", hair: "#6b3f1f", shirt: "#5f87b3", trousers: "#4b5563", style: 1 },
  2: { skin: "#c68b5e", skinLine: "#8a5530", hair: "#231a14", shirt: "#6c9a6c", trousers: "#475161", style: 2 },
  3: { skin: "#7a4a2c", skinLine: "#4a2a17", hair: "#141010", shirt: "#a9805a", trousers: "#3f4754", style: 3 },
};

/** The worker without protective equipment: plain clothes and trainers. */
export function Worker({ worker, showFeet = true }: { worker: WorkerId; showFeet?: boolean }) {
  const w = WORKER_LOOKS[worker];
  return (
    <g data-worker={worker}>
      <ellipse cx="120" cy="398" rx="62" ry="6" fill="#000" opacity="0.12" />
      {/* trousers */}
      <path d="M90 198 L150 198 L148 378 L123 378 L120 252 L117 378 L92 378 Z" fill={w.trousers} stroke="#2b313b" stroke-width="1.5" stroke-linejoin="round" />
      {/* trainers */}
      {showFeet && (
        <Mirrored>
          <path d="M92 372 L118 372 L119 390 L82 390 Q77 390 79 384 Q81 377 92 375 Z" fill="#e8ecf1" stroke="#64748b" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M80 386 L119 386" stroke="#94a3b8" stroke-width="2" />
        </Mirrored>
      )}
      {/* arms: bare forearms, short sleeves */}
      <Mirrored>
        <polyline points="90,112 80,160 72,204" fill="none" stroke={w.skinLine} stroke-width="19" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="90,112 80,160 72,204" fill="none" stroke={w.skin} stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="91,110 85,138" fill="none" stroke={w.shirt} stroke-width="22" stroke-linecap="round" />
        <circle cx="71" cy="213" r="10" fill={w.skin} stroke={w.skinLine} stroke-width="1.5" />
      </Mirrored>
      {/* neck and T-shirt */}
      <rect x="111" y="80" width="18" height="24" fill={w.skin} stroke={w.skinLine} stroke-width="1.5" />
      <path d="M86 112 Q88 100 102 98 L138 98 Q152 100 154 112 L151 204 L89 204 Z" fill={w.shirt} stroke="#2b313b" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M108 98 Q120 112 132 98 Z" fill={w.skin} stroke={w.skinLine} stroke-width="1.2" />
      {/* head */}
      <Mirrored>
        <ellipse cx="94" cy="60" rx="5.5" ry="8.5" fill={w.skin} stroke={w.skinLine} stroke-width="1.5" />
      </Mirrored>
      <ellipse cx="120" cy="58" rx="26" ry="29" fill={w.skin} stroke={w.skinLine} stroke-width="1.5" />
      <Hair style={w.style} color={w.hair} />
      {/* a friendly face */}
      <path d="M104 48 Q110 45 115 48 M125 48 Q130 45 136 48" fill="none" stroke={w.hair} stroke-width="2.2" stroke-linecap="round" />
      <circle cx="110" cy="57" r="3" fill="#2a2320" />
      <circle cx="130" cy="57" r="3" fill="#2a2320" />
      <circle cx="111" cy="56" r="0.9" fill="#fff" />
      <circle cx="131" cy="56" r="0.9" fill="#fff" />
      <path d="M120 60 Q116.5 67 121 68.5" fill="none" stroke={w.skinLine} stroke-width="1.6" stroke-linecap="round" />
      <path d="M110 75 Q120 83 130 75" fill="none" stroke="#6b2f2a" stroke-width="2.4" stroke-linecap="round" />
    </g>
  );
}

/** Short hair, three styles: side-parted, curly, a short crop. */
function Hair({ style, color }: { style: 1 | 2 | 3; color: string }) {
  if (style === 2)
    return (
      <g fill={color}>
        <path d="M95 50 Q95 36 120 32 Q145 36 145 50 Q134 41 120 41 Q106 41 95 50 Z" />
        {[
          [99, 44, 7],
          [105, 36, 8],
          [115, 31, 8.5],
          [126, 31, 8.5],
          [136, 36, 8],
          [142, 44, 7],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    );
  if (style === 3)
    return <path d="M95 47 Q94 29 120 28 Q146 29 145 47 Q139 37 120 36.5 Q101 37 95 47 Z" fill={color} />;
  return <path d="M94 52 Q91 26 120 26 Q149 26 146 52 Q142 40 128 37 Q114 44 99 42 Q95 46 94 52 Z" fill={color} />;
}

/** The children, and the same mirrored to the other side of the worker. */
function Mirrored({ children }: { children: ComponentChildren }) {
  return (
    <>
      <g>{children}</g>
      <g transform="matrix(-1 0 0 1 240 0)">{children}</g>
    </>
  );
}

/** The part of the worker an item goes on, as rectangles in the worker's coordinates (highlighted while dragging). */
export const ZONE_BOXES: Record<ZoneId, [number, number, number, number][]> = {
  head: [[84, 12, 72, 46]],
  eyes: [[94, 42, 52, 30]],
  ears: [
    [80, 46, 24, 30],
    [136, 46, 24, 30],
  ],
  face: [[88, 32, 64, 72]],
  hands: [
    [52, 160, 40, 78],
    [148, 160, 40, 78],
  ],
  feet: [[74, 312, 92, 86]],
  body: [[56, 90, 128, 292]],
  fallArrest: [[82, 94, 76, 152]],
};

/** The cut-out of each item for the rack and the sign: x, y, width, height in the worker's coordinates. */
export const ITEM_BOX: Record<ItemId, [number, number, number, number]> = {
  helmet: [80, 14, 80, 46],
  bumpCap: [86, 18, 68, 48],
  hairnet: [86, 16, 68, 42],
  goggles: [86, 40, 68, 32],
  earPlugs: [86, 50, 68, 56],
  earMuffs: [80, 10, 80, 68],
  faceShield: [84, 26, 72, 82],
  dustMask: [88, 54, 64, 44],
  respirator: [86, 56, 68, 46],
  workGloves: [54, 188, 36, 48],
  chemicalGloves: [52, 160, 42, 76],
  cutGloves: [54, 188, 36, 48],
  safetyShoes: [74, 352, 92, 46],
  rubberBoots: [74, 312, 92, 86],
  hiVis: [80, 94, 80, 116],
  coverall: [56, 90, 128, 292],
  chemicalApron: [80, 88, 80, 218],
  coldClothing: [54, 86, 132, 296],
  harness: [82, 94, 76, 150],
};

/** The order in which worn items are drawn on the worker: clothing first, then what goes over it, the face last. */
export const LAYER: ItemId[] = [
  "coverall", "coldClothing", "safetyShoes", "rubberBoots", "workGloves", "chemicalGloves", "cutGloves", "chemicalApron", "hiVis",
  "harness", "hairnet", "earMuffs", "helmet", "bumpCap", "earPlugs", "goggles", "dustMask", "respirator", "faceShield",
];

/** Colours of a drawing; in a sign every fill is white and every line the sign's blue. */
type Paint = (fill: string, line?: string) => { fill: string; stroke: string };
const colour = (mono: boolean): Paint => (fill, line = "#1f2937") => (mono ? { fill: fill === "none" ? "none" : "#fff", stroke: SIGN_BLUE } : { fill, stroke: line });
/** A line drawn in a colour (or the sign's blue). */
const ink = (mono: boolean, color: string) => (mono ? SIGN_BLUE : color);

type ItemProps = { mono?: boolean };

/** An item as it sits on the worker. */
export function ItemShape({ id, mono = false }: { id: ItemId; mono?: boolean }): JSX.Element {
  const Shape = SHAPES[id];
  return <Shape mono={mono} />;
}

const SHAPES: Record<ItemId, (props: ItemProps) => JSX.Element> = {
  helmet: ({ mono }) => {
    const p = colour(!!mono)("#f4c430", "#8a6a0c");
    return (
      <g stroke-linejoin="round">
        <path d="M91 50 Q91 19 120 19 Q149 19 149 50 Z" {...p} stroke-width="2" />
        <path d="M113 21 L113 50 M127 21 L127 50" fill="none" stroke={p.stroke} stroke-width="1.6" opacity="0.6" />
        <path d="M83 49 L157 49 L155 56 L85 56 Z" {...p} stroke-width="2" />
        {!mono && <path d="M99 42 Q100 29 110 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55" />}
      </g>
    );
  },
  bumpCap: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <g stroke-linejoin="round">
        <path d="M93 49 Q93 24 120 24 Q147 24 147 49 Z" {...c("#2b4c7e", "#142844")} stroke-width="2" />
        <path d="M95 42 Q120 35 145 42" fill="none" stroke={ink(!!mono, "#dfe6ee")} stroke-width="3" />
        <path d="M90 48 Q120 57 150 48 L150 53 Q120 64 90 53 Z" {...c("#1f3a63", "#142844")} stroke-width="2" />
        <circle cx="120" cy="25" r="2.6" {...c("#1f3a63", "#142844")} stroke-width="1" />
      </g>
    );
  },
  hairnet: ({ mono }) => {
    const p = colour(!!mono)("#e3f0fc", "#6f9cc7");
    return (
      <g>
        <path d="M93 52 Q90 21 120 21 Q150 21 147 52 Q120 44 93 52 Z" {...p} stroke-width="1.5" opacity={mono ? 1 : 0.92} />
        <path
          d="M104 48 Q101 32 109 24 M120 46 L120 22 M136 48 Q139 32 131 24 M94 40 Q120 31 146 40 M97 30 Q120 23 143 30"
          fill="none"
          stroke={ink(!!mono, "#8fb5da")}
          stroke-width="1.2"
        />
        <path d="M93 52 Q120 44 147 52" fill="none" stroke={p.stroke} stroke-width="3" stroke-linecap="round" />
      </g>
    );
  },
  goggles: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <g>
        <path d="M88 57 L152 57" stroke={ink(!!mono, "#374151")} stroke-width="4" stroke-linecap="round" />
        <rect x="97" y="46" width="46" height="21" rx="9" {...c("#bfe6f7", "#1f6f99")} fill-opacity={mono ? 1 : 0.6} stroke-width="3" />
        <path d="M114 67 Q120 60 126 67" fill="none" stroke={c("", "#1f6f99").stroke} stroke-width="2.5" />
        {!mono && <path d="M103 51 L111 51" stroke="#fff" stroke-width="2" stroke-linecap="round" />}
      </g>
    );
  },
  earPlugs: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <g>
        <path d="M95 64 Q96 93 120 101 Q144 93 145 64" fill="none" stroke={ink(!!mono, "#2f6fb0")} stroke-width="1.8" />
        <Mirrored>
          <ellipse cx="94" cy="60" rx="5.5" ry="6.5" {...c("#f28c28", "#a3520c")} stroke-width="1.5" />
        </Mirrored>
      </g>
    );
  },
  earMuffs: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <g>
        <path d="M91 52 Q89 15 120 15 Q151 15 149 52" fill="none" stroke={ink(!!mono, "#374151")} stroke-width="5" stroke-linecap="round" />
        <Mirrored>
          <rect x="82" y="46" width="17" height="29" rx="7" {...c("#2f9e5b", "#17603a")} stroke-width="2" />
          <path d="M98 50 L98 71" stroke={ink(!!mono, "#17603a")} stroke-width="2" />
        </Mirrored>
      </g>
    );
  },
  faceShield: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <g>
        <path d="M93 92 L93 40 Q120 33 147 40 L151 92 Q120 105 89 92 Z" {...c("#cde9fa", "#3b82b5")} fill-opacity={mono ? 1 : 0.42} stroke-width="2" stroke-linejoin="round" />
        <path d="M92 38 Q120 30 148 38" fill="none" stroke={ink(!!mono, "#374151")} stroke-width="5" stroke-linecap="round" />
        {!mono && <path d="M101 50 L99 84" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.75" />}
      </g>
    );
  },
  dustMask: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <g>
        <path d="M104 72 L95 61 M136 72 L145 61" stroke={ink(!!mono, "#64748b")} stroke-width="1.6" />
        <path d="M103 70 Q120 59 137 70 Q141 87 120 96 Q99 87 103 70 Z" {...c("#f8fafc", "#7c8ba1")} stroke-width="2" stroke-linejoin="round" />
        <path d="M112 66 Q120 62.5 128 66" fill="none" stroke={ink(!!mono, "#7c8ba1")} stroke-width="2" />
        <circle cx="127" cy="82" r="4.8" {...c("#60a5fa", "#1d4ed8")} stroke-width="1.5" />
      </g>
    );
  },
  respirator: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <g>
        <path d="M106 70 L95 61 M134 70 L145 61" stroke={ink(!!mono, "#374151")} stroke-width="2" />
        <path d="M106 68 Q120 59 134 68 L136 87 Q120 99 104 87 Z" {...c("#6b7280", "#1f2937")} stroke-width="2" stroke-linejoin="round" />
        <Mirrored>
          <circle cx="101" cy="86" r="9.5" {...c("#a0522d", "#5c2a10")} stroke-width="2" />
          <circle cx="101" cy="86" r="4.5" fill="none" stroke={ink(!!mono, "#5c2a10")} stroke-width="1.5" />
        </Mirrored>
        <rect x="115" y="84" width="10" height="8" rx="2" {...c("#374151", "#111827")} stroke-width="1" />
      </g>
    );
  },
  workGloves: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <Mirrored>
        <Glove paint={c("#d9a441", "#7a4f12")} cuff={c("#b7832a", "#7a4f12")} lines={ink(!!mono, "#9a6a1c")} />
      </Mirrored>
    );
  },
  chemicalGloves: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <Mirrored>
        <path d="M71 166 L89 169 L83 204 L82 222 Q81 231 71 232 Q60 231 60 222 L61 204 Z" {...c("#2a9d8f", "#0f5249")} stroke-width="2" stroke-linejoin="round" />
        <path d="M71.5 172 L88 175" stroke={ink(!!mono, "#0f5249")} stroke-width="2" />
        <ellipse cx="83" cy="211" rx="4" ry="7" {...c("#2a9d8f", "#0f5249")} stroke-width="1.8" />
      </Mirrored>
    );
  },
  cutGloves: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <Mirrored>
        <Glove paint={c("#aab4bf", "#3f4a57")} cuff={c("#8b96a3", "#3f4a57")} lines={ink(!!mono, "#3f4a57")} />
        {!mono && <path d="M60.5 219 L81.5 219 L82 222 Q81 231 71 232 Q60 231 60 222 Z" fill="#3f4a57" />}
        <g fill={ink(!!mono, "#5b6672")}>
          {[
            [65, 205],
            [71, 205],
            [77, 205],
            [68, 211],
            [74, 211],
            [65, 216],
            [77, 216],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" />
          ))}
        </g>
      </Mirrored>
    );
  },
  safetyShoes: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <Mirrored>
        <path d="M93 358 L118 358 L119 390 L82 390 Q77 390 79 384 Q81 376 93 374 Z" {...c("#4a3326", "#1c120c")} stroke-width="2" stroke-linejoin="round" />
        <path d="M79 384 Q81 376 93 374 L95 390 L82 390 Q77 390 79 384 Z" {...c("#7b5a43", "#1c120c")} stroke-width="1.5" />
        <path d="M100 364 L112 364 M100 369 L112 369" stroke={ink(!!mono, "#e6d3b8")} stroke-width="1.6" />
        <path d="M77 390 L120 390 L120 395 L77 395 Z" {...c("#111827", "#111827")} stroke-width="1" />
      </Mirrored>
    );
  },
  rubberBoots: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <Mirrored>
        <path d="M93 316 L118 316 L119 390 L82 390 Q77 390 79 384 Q81 376 93 374 Z" {...c("#2f6b3a", "#163a1d")} stroke-width="2" stroke-linejoin="round" />
        <path d="M93 316 L118 316 L118 325 L93 325 Z" {...c("#f2c230", "#163a1d")} stroke-width="1.5" />
        <path d="M77 390 L120 390 L120 395 L77 395 Z" {...c("#f2c230", "#163a1d")} stroke-width="1" />
      </Mirrored>
    );
  },
  hiVis: ({ mono }) => {
    const c = colour(!!mono);
    const band = c("#d5dbe2", "#8a96a3");
    return (
      <g stroke-linejoin="round">
        <path d="M86 112 Q88 101 103 99 L120 132 L137 99 Q152 101 154 112 L151 205 L89 205 Z" {...c("#e4f03a", "#7d8a0f")} stroke-width="2" />
        <path d="M88 158 L152 158 L152 168 L88 168 Z M88 182 L151.5 182 L151.5 192 L88.5 192 Z" {...band} stroke-width="1" />
        {!mono && <path d="M88 163 L152 163 M88.5 187 L151.5 187" stroke="#fff" stroke-width="1.5" />}
        <path d="M120 132 L120 205" stroke={ink(!!mono, "#7d8a0f")} stroke-width="1.8" />
      </g>
    );
  },
  coverall: ({ mono }) => {
    const c = colour(!!mono);
    const suit = c("#2c4f86", "#16294a");
    return (
      <g stroke-linejoin="round">
        <Mirrored>
          <polyline points="90,112 80,160 72,201" fill="none" stroke={suit.stroke} stroke-width="23" stroke-linecap="round" />
          <polyline points="90,112 80,160 72,201" fill="none" stroke={suit.fill} stroke-width="19.5" stroke-linecap="round" />
        </Mirrored>
        <path d="M89 196 L151 196 L149 380 L123 380 L120 254 L117 380 L91 380 Z" {...suit} stroke-width="2" />
        <path d="M86 112 Q88 100 102 98 L138 98 Q152 100 154 112 L151 206 L89 206 Z" {...suit} stroke-width="2" />
        <path d="M105 98 L120 112 L135 98" {...c("#3d67a8", "#16294a")} stroke-width="2" />
        <path d="M120 112 L120 246" stroke={ink(!!mono, "#a9bddb")} stroke-width="1.6" />
        <rect x="127" y="122" width="15" height="13" rx="1.5" fill="none" stroke={ink(!!mono, "#a9bddb")} stroke-width="1.5" />
      </g>
    );
  },
  chemicalApron: ({ mono }) => {
    const c = colour(!!mono);
    return (
      <g stroke-linejoin="round">
        <path d="M104 113 Q120 88 136 113" fill="none" stroke={ink(!!mono, "#1f5f45")} stroke-width="2.5" />
        <path d="M104 112 L136 112 L138 130 Q151 134 151 146 L147 302 L93 302 L89 146 Q89 134 102 130 Z" {...c("#7cc6a4", "#1f5f45")} stroke-width="2" />
        <path d="M89 150 L82 154 M151 150 L158 154" stroke={ink(!!mono, "#1f5f45")} stroke-width="2.5" stroke-linecap="round" />
        {!mono && <path d="M98 150 L96 290" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.5" />}
      </g>
    );
  },
  coldClothing: ({ mono }) => {
    const c = colour(!!mono);
    const suit = c("#b4362f", "#5e1511");
    const quilt = ink(!!mono, "#7e211b");
    return (
      <g stroke-linejoin="round">
        <Mirrored>
          <polyline points="90,112 79,160 71,199" fill="none" stroke={suit.stroke} stroke-width="27" stroke-linecap="round" />
          <polyline points="90,112 79,160 71,199" fill="none" stroke={suit.fill} stroke-width="23.5" stroke-linecap="round" />
          <path d="M70 140 L92 146 M66 170 L88 174 M63 194 L82 197" stroke={quilt} stroke-width="1.6" />
        </Mirrored>
        <path d="M87 198 L153 198 L151 380 L124 380 L120 256 L116 380 L89 380 Z" {...suit} stroke-width="2" />
        <path d="M83 112 Q85 97 102 95 L138 95 Q155 97 157 112 L154 210 L86 210 Z" {...suit} stroke-width="2" />
        <path
          d="M85 132 L155 132 M85 152 L155 152 M85 172 L155 172 M86 192 L154 192 M88 236 L119 236 M121 236 L152 236 M89 276 L118 276 M122 276 L151 276 M89 316 L118 316 M122 316 L150 316 M90 352 L118 352 M122 352 L150 352"
          stroke={quilt}
          stroke-width="1.6"
        />
        <path d="M120 104 L120 210" stroke={ink(!!mono, "#e9b4ad")} stroke-width="1.8" />
        <path d="M99 89 Q120 101 141 89 L142 98 Q120 110 98 98 Z" {...c("#eef1f4", "#8a96a3")} stroke-width="1.5" />
      </g>
    );
  },
  harness: ({ mono }) => {
    const web = ink(!!mono, "#e8740f");
    const metal = ink(!!mono, "#4b5563");
    return (
      <g fill="none" stroke-linecap="round">
        {mono && <path d="M100 100 L108 205 M140 100 L132 205 M101 141 L139 141 M90 205 L150 205" stroke="#fff" stroke-width="9" />}
        <path d="M100 100 L108 205 M140 100 L132 205" stroke={web} stroke-width="6" />
        <path d="M101 141 L139 141" stroke={web} stroke-width="5" />
        <path d="M90 205 L150 205" stroke={web} stroke-width="6" />
        <ellipse cx="105" cy="232" rx="14" ry="5" stroke={web} stroke-width="5" />
        <ellipse cx="135" cy="232" rx="14" ry="5" stroke={web} stroke-width="5" />
        <path d="M95 205 L94 230 M145 205 L146 230" stroke={web} stroke-width="5" />
        <circle cx="120" cy="131" r="6" stroke={metal} stroke-width="3" />
        <rect x="96" y="136" width="8" height="10" rx="1.5" fill={mono ? "#fff" : "#374151"} stroke={metal} stroke-width="1" />
        <rect x="136" y="136" width="8" height="10" rx="1.5" fill={mono ? "#fff" : "#374151"} stroke={metal} stroke-width="1" />
      </g>
    );
  },
};

/** A glove on the left hand (the drawing mirrors it to the right one): cuff, hand, thumb and finger lines. */
function Glove({ paint, cuff, lines }: { paint: { fill: string; stroke: string }; cuff: { fill: string; stroke: string }; lines: string }) {
  return (
    <g stroke-linejoin="round">
      <path d="M62 193 L81 194 L81 203 L61 202 Z" {...cuff} stroke-width="1.8" />
      <path d="M61 202 L81 203 L82 222 Q81 231 71 232 Q60 231 60 222 Z" {...paint} stroke-width="1.8" />
      <ellipse cx="83" cy="211" rx="4" ry="7" {...paint} stroke-width="1.6" />
      <path d="M65 224 L65 231 M70 225 L70 232 M75 224 L75 231" stroke={lines} stroke-width="1.3" />
    </g>
  );
}

/** An item on its own, for the rack, the drag and the authoring mode. Decorative: the button around it names it. */
export function ItemIcon({ id, size = 56, className }: { id: ItemId; size?: number; className?: string }) {
  const [x, y, w, h] = ITEM_BOX[id];
  return (
    <svg className={className} width={size} height={size} viewBox={`${x} ${y} ${w} ${h}`} aria-hidden="true" focusable="false" overflow="hidden" data-icon={id}>
      <ItemShape id={id} />
    </svg>
  );
}

/** Items whose sign shows them on a head, as mandatory signs do. */
const ON_HEAD: ItemId[] = ["helmet", "bumpCap", "hairnet", "goggles", "earPlugs", "earMuffs", "faceShield", "dustMask", "respirator"];

/**
 * The cut-out of an item in its sign (worker coordinates): a head with the item on it, one glove, one shoe, the body
 * with the harness; the rest as in the rack.
 */
const SIGN_BOX: Partial<Record<ItemId, [number, number, number, number]>> = {
  ...Object.fromEntries(ON_HEAD.map((id) => [id, [74, 12, 92, 92]])),
  workGloves: [50, 186, 44, 50],
  cutGloves: [50, 186, 44, 50],
  chemicalGloves: [46, 160, 54, 78],
  safetyShoes: [72, 346, 48, 52],
  rubberBoots: [66, 312, 54, 86],
  harness: [58, 22, 124, 228],
};

/** A white head and shoulders, for the signs of what goes on the head. */
const HeadSilhouette = () => (
  <g fill="#fff">
    <path d="M74 104 Q78 96 104 94 L136 94 Q162 96 166 104 L166 112 L74 112 Z" />
    <rect x="110" y="78" width="20" height="20" />
    <ellipse cx="120" cy="58" rx="26" ry="29" />
    <ellipse cx="94" cy="60" rx="5.5" ry="8.5" />
    <ellipse cx="146" cy="60" rx="5.5" ry="8.5" />
  </g>
);

/** A white body, for the sign of the harness. */
const BodySilhouette = () => (
  <g fill="#fff" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="120" cy="58" rx="26" ry="29" />
    <rect x="111" y="80" width="18" height="24" />
    <polyline points="90,112 80,160 72,204" fill="none" stroke-width="18" />
    <polyline points="150,112 160,160 168,204" fill="none" stroke-width="18" />
    <path d="M86 112 Q88 100 102 98 L138 98 Q152 100 154 112 L151 204 L89 204 Z" />
    <path d="M90 198 L150 198 L148 250 L92 250 Z" />
  </g>
);

/** Ear plugs in a sign: drawn larger than on the worker, so they show at the size of a sign. */
const SignEarPlugs = () => (
  <g fill="#fff" stroke={SIGN_BLUE} stroke-width="3">
    <path d="M90 66 Q92 98 120 104 Q148 98 150 66" fill="none" stroke-width="3" />
    <ellipse cx="88" cy="60" rx="9" ry="11" />
    <ellipse cx="152" cy="60" rx="9" ry="11" />
  </g>
);

/**
 * The blue mandatory sign of an item: a white pictogram on a blue disc with a white rim. Drawn here, in the spirit of
 * the mandatory signs (a head with a helmet, a glove, a boot), not a copy of the ISO 7010 artwork.
 */
export function Sign({ id, size = 28, className }: { id: ItemId; size?: number; className?: string }) {
  const [x, y, w, h] = SIGN_BOX[id] ?? ITEM_BOX[id];
  // the pictogram fits a square in the disc, centred
  const side = Math.max(w, h);
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false" data-sign={id}>
      <circle cx="20" cy="20" r="19.5" fill="#fff" />
      <circle cx="20" cy="20" r="17.5" fill={SIGN_BLUE} />
      <svg x="7" y="7" width="26" height="26" viewBox={`${x - (side - w) / 2} ${y - (side - h) / 2} ${side} ${side}`} overflow="hidden">
        {ON_HEAD.includes(id) && <HeadSilhouette />}
        {id === "harness" && <BodySilhouette />}
        {id === "earPlugs" ? <SignEarPlugs /> : <ItemShape id={id} mono />}
      </svg>
    </svg>
  );
}

/** The face of a worker, for the choice of the worker. */
export function WorkerFace({ worker, size = 40 }: { worker: WorkerId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="82 20 76 76" aria-hidden="true" focusable="false" overflow="hidden">
      <Worker worker={worker} />
    </svg>
  );
}
