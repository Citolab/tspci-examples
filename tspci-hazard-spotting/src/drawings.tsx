/*
 * The four scenes, drawn in SVG (800 × 500 units), simple and flat, with dark outlines: a building site with a mobile
 * scaffold, a warehouse, a kitchen and a workshop. Every hazard has an unsafe and a safe version (`unsafe(id)`): the
 * author's choice of hazards decides which one the pupil sees. Where the spots are, and their texts, is in scenes.ts.
 * Nothing here is copied from a photo or a safety sign: the signs are plain shapes with text.
 */
import type { ComponentChildren } from "preact";
import type { SceneId } from "./scenes";

export const INK = "#1f2937";

/** The texts in the pictures (on signs and labels), in the PCI's language. */
export type PictureTexts = {
  helmetSign: string;
  exit: string;
  wetFloor: [string, string];
  oil: string;
  fireBlanket: [string, string];
  firstAid: string;
};

type SceneProps = { unsafe: (id: string) => boolean; t: PictureTexts };

// ---- people and things that come back ----

type PersonProps = {
  x: number;
  y: number;
  s?: number;
  skin?: string;
  hair?: string;
  shirt?: string;
  trousers?: string;
  /** the colour of the helmet, or none */
  helmet?: string | null;
  vest?: boolean;
  goggles?: boolean;
  scarf?: boolean;
  belt?: boolean;
  /** the hands, relative to the feet, in the person's own units (a person is about 120 high) */
  hands?: [number, number][];
};

/** A person, from the front, standing at (x, y) (the feet). */
function Person({ x, y, s = 1, skin = "#f1c27d", hair = "#4b2e1a", shirt = "#3b82f6", trousers = "#334155", helmet = null, vest, goggles, scarf, belt, hands }: PersonProps) {
  const [left, right] = hands ?? [[-21, -52], [21, -52]];
  const arm = (sx: number, [hx, hy]: [number, number]) => (
    <>
      <path d={`M${sx} -84 L${hx} ${hy}`} stroke={INK} stroke-width="11" stroke-linecap="round" />
      <path d={`M${sx} -84 L${hx} ${hy}`} stroke={shirt} stroke-width="7" stroke-linecap="round" />
      <circle cx={hx} cy={hy} r="4.5" fill={skin} stroke={INK} stroke-width="1.5" />
    </>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke={INK} stroke-width="2" stroke-linejoin="round">
      <rect x="-12" y="-50" width="10" height="46" fill={trousers} />
      <rect x="2" y="-50" width="10" height="46" fill={trousers} />
      <ellipse cx="-8" cy="-3" rx="8" ry="4" fill="#111827" />
      <ellipse cx="8" cy="-3" rx="8" ry="4" fill="#111827" />
      {arm(-13, left)}
      {arm(13, right)}
      <rect x="-16" y="-90" width="32" height="44" rx="9" fill={shirt} />
      {vest && (
        <>
          <rect x="-15" y="-88" width="30" height="40" rx="7" fill="#f97316" />
          <rect x="-15" y="-71" width="30" height="4" fill="#fef08a" stroke="none" />
          <rect x="-15" y="-61" width="30" height="4" fill="#fef08a" stroke="none" />
        </>
      )}
      {belt && <path d="M-13 -86 L13 -52" stroke="#111827" stroke-width="4" />}
      <rect x="-4" y="-97" width="8" height="8" fill={skin} />
      <circle cx="0" cy="-105" r="12" fill={skin} />
      {!helmet && <path d="M-12.5 -106 Q-13 -119 0 -119 Q13 -119 12.5 -106 Q7 -112 0 -111.5 Q-7 -112 -12.5 -106 Z" fill={hair} />}
      {goggles ? (
        <>
          <path d="M-12 -106 H12" stroke="#1e3a8a" stroke-width="2.5" />
          <rect x="-10" y="-110" width="20" height="8" rx="3.5" fill="#bfdbfe" stroke="#1e3a8a" stroke-width="1.8" />
        </>
      ) : (
        <>
          <circle cx="-4" cy="-105" r="1.7" fill={INK} stroke="none" />
          <circle cx="4" cy="-105" r="1.7" fill={INK} stroke="none" />
        </>
      )}
      <path d="M-4 -99 Q0 -96 4 -99" fill="none" stroke-width="1.5" />
      {helmet && (
        <>
          <path d="M-13 -108 A13 13 0 0 1 13 -108 Z" fill={helmet} />
          <rect x="-16" y="-110" width="32" height="4" rx="2" fill={helmet} />
          <path d="M0 -121 V-110" stroke-width="1.5" />
        </>
      )}
      {scarf && (
        <>
          <path d="M-5 -94 C-18 -98 -26 -84 -38 -88 C-46 -91 -52 -86 -60 -84 L-58 -77 C-50 -79 -44 -84 -36 -81 C-24 -77 -16 -90 -3 -87 Z" fill="#dc2626" />
          <path d="M-60 -84 l-5 1 M-59 -80.5 l-5 1 M-58 -77 l-5 1" stroke="#dc2626" stroke-width="1.5" />
          <rect x="-9" y="-97" width="18" height="8" rx="3" fill="#dc2626" />
        </>
      )}
    </g>
  );
}

/** A cardboard box. */
const Box = ({ x, y, w = 38, h = 28, r = 0 }: { x: number; y: number; w?: number; h?: number; r?: number }) => (
  <g transform={r ? `rotate(${r} ${x + w / 2} ${y + h / 2})` : undefined}>
    <rect x={x} y={y} width={w} height={h} fill="#d4a373" stroke={INK} stroke-width="2" />
    <path d={`M${x + w / 2} ${y + 1} V${y + h - 1}`} stroke="#a47148" stroke-width="3" />
  </g>
);

/** A wooden pallet seen from the front. */
const Pallet = ({ x, y, w }: { x: number; y: number; w: number }) => (
  <g stroke={INK} stroke-width="2" fill="#b7791f">
    <rect x={x} y={y} width={w} height="5" />
    <rect x={x} y={y + 5} width="12" height="7" />
    <rect x={x + w / 2 - 6} y={y + 5} width="12" height="7" />
    <rect x={x + w - 12} y={y + 5} width="12" height="7" />
  </g>
);

const Brick = ({ x, y, w = 24 }: { x: number; y: number; w?: number }) => <rect x={x} y={y} width={w} height="10" fill="#c8643c" stroke={INK} stroke-width="1.5" />;

/** A ladder from its foot to its top (the middles of its ends). */
function Ladder({ foot, top, width = 22 }: { foot: [number, number]; top: [number, number]; width?: number }) {
  const [dx, dy] = [top[0] - foot[0], top[1] - foot[1]];
  const length = Math.hypot(dx, dy);
  const [px, py] = [(-dy / length) * (width / 2), (dx / length) * (width / 2)];
  const rungs = Math.floor(length / 28);
  const at = (t: number, side: number): [number, number] => [foot[0] + dx * t + side * px, foot[1] + dy * t + side * py];
  return (
    <g stroke={INK} stroke-linecap="round">
      {Array.from({ length: rungs }, (_, i) => {
        const t = (i + 0.7) / (rungs + 0.4);
        const [a, b] = [at(t, -1), at(t, 1)];
        return <path key={i} d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`} stroke="#a3a3a3" stroke-width="4" />;
      })}
      {[-1, 1].map((side) => {
        const [a, b] = [at(0, side), at(1, side)];
        return (
          <g key={side}>
            <path d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`} stroke-width="8" />
            <path d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`} stroke="#d4d4d4" stroke-width="4.5" />
          </g>
        );
      })}
    </g>
  );
}

const Cloud = ({ x, y }: { x: number; y: number }) => (
  <g fill="#fff">
    <ellipse cx={x} cy={y} rx="34" ry="14" />
    <ellipse cx={x + 22} cy={y - 8} rx="22" ry="14" />
    <ellipse cx={x - 18} cy={y - 4} rx="16" ry="11" />
  </g>
);

/** Text on a sign or a label, centred. */
const Label = ({ x, y, size, fill = "#fff", children }: { x: number; y: number; size: number; fill?: string; children: ComponentChildren }) => (
  <text x={x} y={y} font-size={size} font-weight="700" fill={fill} text-anchor="middle" stroke="none" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">
    {children}
  </text>
);

// ---- the building site ----

function Scaffold({ unsafe, t }: SceneProps) {
  const posts = [160, 380];
  // the mortar of the wall: rows of bricks, every other row half a brick on
  const mortar: string[] = [];
  for (let row = 0, y = 166; y < 380; row++, y += 16) {
    mortar.push(`M560 ${y} H790`);
    for (let x = 560 + (row % 2 ? 16 : 32); x < 790; x += 32) if (!(x > 618 && x < 702 && y > 180 && y < 276)) mortar.push(`M${x} ${y} v16`);
  }
  const ladderUnsafe = unsafe("ladder");
  return (
    <g stroke={INK} stroke-width="2" stroke-linejoin="round">
      <rect width="800" height="500" fill="#dbeafe" stroke="none" />
      <Cloud x={110} y={62} />
      <Cloud x={470} y={44} />
      <rect y="300" width="800" height="200" fill="#ead9b0" stroke="none" />
      <path d="M0 300 H800" stroke="#c9b48a" />

      {/* the building, half built */}
      <path d="M560 382 V150 H612 V134 H700 V120 H790 V382 Z" fill="#c8643c" />
      <path d={mortar.join(" ")} stroke="#e7b9a2" stroke-width="1.5" />
      <rect x="612" y="180" width="96" height="10" fill="#94a3b8" />
      <rect x="620" y="190" width="80" height="84" fill="#334155" />

      {/* the sign (a look-alike) */}
      <rect x="56" y="250" width="8" height="74" fill="#9ca3af" />
      <rect x="10" y="196" width="100" height="66" rx="5" fill="#1d4ed8" />
      <path d="M48 224 A12 11 0 0 1 72 224 Z" fill="#fff" stroke="none" />
      <rect x="44" y="222" width="32" height="4" rx="2" fill="#fff" stroke="none" />
      <Label x={60} y={250} size={13}>{t.helmetSign}</Label>

      {/* the ladder against the building: on a bucket, or on the ground and tied */}
      {ladderUnsafe ? (
        <>
          <path d="M479 392 H507 L514 428 H472 Z" fill="#f97316" />
          <path d="M470 428 H516" stroke-width="4" />
          <Ladder foot={[493, 392]} top={[548, 150]} />
        </>
      ) : (
        <>
          <Ladder foot={[484, 434]} top={[548, 150]} />
          <rect x="470" y="430" width="10" height="7" fill="#111827" />
          <rect x="490" y="434" width="10" height="7" fill="#111827" />
          <circle cx="570" cy="174" r="4.5" fill="none" stroke-width="2.5" />
          <path d="M545 166 C552 160 566 166 567 172 M546 176 C554 182 566 180 567 176" fill="none" stroke="#a16207" stroke-width="3" />
        </>
      )}

      {/* the mobile scaffold */}
      {posts.map((x) => (
        <rect key={x} x={x - 4} y="180" width="8" height="214" fill="#94a3b8" />
      ))}
      {[236, 296, 356].map((y) => (
        <rect key={y} x="164" y={y - 3} width="212" height="6" fill="#94a3b8" />
      ))}
      <path d="M164 353 L376 299 M164 293 L376 239" stroke="#64748b" stroke-width="5" />
      {posts.map((x) => (
        <g key={`wheel-${x}`}>
          <rect x={x - 6} y="392" width="12" height="10" fill="#475569" />
          <circle cx={x} cy="406" r="11" fill={INK} />
          <circle cx={x} cy="406" r="4" fill="#9ca3af" />
          {unsafe("wheels") ? (
            <path d={`M${x + 6} 398 L${x + 17} 381`} stroke="#dc2626" stroke-width="6" stroke-linecap="round" />
          ) : (
            <path d={`M${x + 6} 397 L${x + 22} 400`} stroke="#dc2626" stroke-width="6" stroke-linecap="round" />
          )}
        </g>
      ))}

      {/* the platform, with or without a railing */}
      {!unsafe("materials") && (
        <g>
          {[300, 324, 348].map((x) => <Brick key={x} x={x} y={164} />)}
          {[312, 336].map((x) => <Brick key={x} x={x} y={154} />)}
        </g>
      )}
      <rect x="150" y="176" width="240" height="12" fill="#c08a4a" />
      <Person x={240} y={176} helmet="#facc15" vest hands={[[-22, -54], [24, -64]]} />
      {!unsafe("railing") && (
        <g>
          {posts.map((x) => <rect key={x} x={x - 4} y="106" width="8" height="72" fill="#94a3b8" />)}
          <rect x="156" y="110" width="228" height="7" fill="#94a3b8" />
          <rect x="156" y="138" width="228" height="6" fill="#94a3b8" />
          <rect x="152" y="160" width="236" height="16" fill="#facc15" />
        </g>
      )}
      {unsafe("materials") && (
        <g>
          <path d="M328 176 L324 152 H352 L348 176 Z" fill="#9ca3af" />
          <path d="M324 152 Q338 140 352 152" fill="none" />
          {[358, 382].map((x) => <Brick key={x} x={x} y={166} />)}
          {[364, 388].map((x) => <Brick key={x} x={x} y={156} />)}
          {[372, 396].map((x) => <Brick key={x} x={x} y={146} />)}
          <g transform="rotate(14 404 136)">
            <Brick x={384} y={131} />
          </g>
        </g>
      )}

      {/* the hole, and its fence */}
      <path d="M418 470 Q440 438 470 470 Z" fill="#a16207" />
      <ellipse cx="330" cy="458" rx="70" ry="20" fill="#7c4a1e" />
      <ellipse cx="330" cy="461" rx="60" ry="14" fill="#3f2310" stroke="none" />
      {!unsafe("hole") && (
        <g>
          {[254, 330, 406].map((x) => <rect key={x} x={x - 3} y="420" width="6" height="62" fill="#fff" />)}
          {[426, 446].map((y) => (
            <g key={y}>
              <rect x="250" y={y} width="160" height="7" fill="#fff" />
              <path d={`M252 ${y + 3.5} H408`} stroke="#dc2626" stroke-width="5" stroke-dasharray="12 12" />
            </g>
          ))}
        </g>
      )}

      {/* the worker by the wall */}
      <path d="M708 392 L714 470" stroke="#7c4a1e" stroke-width="5" />
      <path d="M706 466 h16 l-3 14 h-10 Z" fill="#9ca3af" />
      <Person x={681} y={474} s={1.05} helmet={unsafe("helmet") ? null : "#facc15"} vest shirt="#16a34a" hands={[[-21, -52], [25, -64]]} />

      {/* the pallet with bricks (a look-alike) */}
      <Pallet x={726} y={464} w={66} />
      {[452, 440, 428, 416].map((y, row) => [728, 749, 770].map((x) => <Brick key={`${row}-${x}`} x={x} y={y} w={21} />))}

      {/* the worker with the wheelbarrow (a look-alike) */}
      <Person x={64} y={478} helmet="#f97316" vest shirt="#0ea5e9" hands={[[26, -50], [30, -46]]} />
      <path d="M92 430 L150 440" stroke-width="5" stroke-linecap="round" />
      <path d="M110 414 H178 L166 446 H124 Z" fill="#16a34a" />
      <path d="M124 446 L120 472" stroke-width="4" />
      <circle cx="166" cy="464" r="13" fill={INK} />
      <circle cx="166" cy="464" r="4" fill="#9ca3af" />
    </g>
  );
}

// ---- the warehouse ----

function Warehouse({ unsafe, t }: SceneProps) {
  const forkY = unsafe("underForks") ? 262 : 378;
  const bay = (x: number, y: number, layers: number) =>
    Array.from({ length: layers }, (_, layer) => [0, 39, 78].map((dx) => <Box key={`${x}-${y}-${layer}-${dx}`} x={x + dx} y={y - 28 * (layer + 1)} />));
  return (
    <g stroke={INK} stroke-width="2" stroke-linejoin="round">
      <rect width="800" height="388" fill="#e2e8f0" stroke="none" />
      <rect x="380" y="22" width="90" height="40" fill="#bae6fd" />
      <rect x="520" y="22" width="90" height="40" fill="#bae6fd" />
      <rect y="388" width="800" height="112" fill="#cbd5e1" stroke="none" />
      <path d="M0 388 H800" />
      <path d="M0 396 H800" stroke="#eab308" stroke-width="4" />

      {/* the racking: the top shelf left (a look-alike) and right (overloaded or not) */}
      {[30, 170, 310].map((x) => <rect key={x} x={x} y="30" width="10" height="360" fill="#2563eb" />)}
      {[152, 272].map((y) => <rect key={y} x="30" y={y} width="290" height="10" fill="#ea580c" />)}
      <Pallet x={44} y={140} w={122} />
      <Pallet x={184} y={140} w={122} />
      {bay(47, 140, 2)}
      {unsafe("overloaded") ? (
        <g>
          {Array.from({ length: 4 }, (_, layer) =>
            [0, 39, 78].map((dx) => <Box key={`o-${layer}-${dx}`} x={187 + dx + layer * 5} y={112 - 28 * layer} />)
          )}
          <Box x={232} y={0} />
          <Box x={276} y={-2} r={18} />
        </g>
      ) : (
        bay(187, 140, 2)
      )}
      <Pallet x={44} y={260} w={122} />
      <Pallet x={184} y={260} w={122} />
      {bay(47, 260, 2)}
      {bay(187, 260, 1)}
      <Pallet x={44} y={376} w={122} />
      <Pallet x={184} y={376} w={122} />
      {bay(47, 376, 1)}
      {bay(187, 376, 2)}

      {/* the emergency exit */}
      <rect x="692" y="236" width="80" height="152" fill="#cbd5e1" />
      <rect x="712" y="250" width="40" height="40" fill="#e0f2fe" />
      <rect x="700" y="312" width="64" height="7" rx="3" fill="#64748b" />
      <rect x="682" y="192" width="100" height="32" rx="4" fill="#15803d" />
      <Label x={732} y={t.exit.length > 6 ? 213 : 215} size={t.exit.length > 6 ? 12 : 16}>{t.exit}</Label>
      {unsafe("exit") && (
        <g>
          <Pallet x={684} y={376} w={96} />
          <Box x={686} y={348} w={31} />
          <Box x={717} y={348} w={31} />
          <Box x={748} y={348} w={31} />
          <Box x={700} y={320} w={31} />
          <Box x={732} y={320} w={31} />
        </g>
      )}

      {/* the fire extinguisher (a look-alike) */}
      <rect x="626" y="300" width="32" height="6" fill="#64748b" />
      <rect x="630" y="268" width="24" height="64" rx="9" fill="#dc2626" />
      <rect x="636" y="256" width="12" height="13" fill="#374151" />
      <path d="M648 260 C664 262 664 290 656 300" fill="none" stroke-width="3" />

      {/* the forklift: the forks up with a person under them, or down */}
      <Person x={548} y={336} s={0.95} helmet="#facc15" belt shirt="#0ea5e9" hands={[[-37, -76], [-33, -72]]} />
      <path d="M482 300 L486 198 M590 300 L586 198" stroke-width="6" />
      <rect x="474" y="192" width="124" height="9" fill="#374151" />
      <path d="M506 300 L514 264" stroke-width="4" />
      <ellipse cx="514" cy="262" rx="11" ry="4" fill="#374151" />
      <rect x="468" y="298" width="140" height="84" rx="10" fill="#facc15" />
      <rect x="590" y="306" width="18" height="70" rx="6" fill="#eab308" />
      <circle cx="506" cy="384" r="24" fill={INK} />
      <circle cx="506" cy="384" r="9" fill="#9ca3af" />
      <circle cx="584" cy="388" r="19" fill={INK} />
      <circle cx="584" cy="388" r="7" fill="#9ca3af" />
      <rect x="452" y="110" width="16" height="280" fill="#475569" />
      <rect x="444" y={forkY - 48} width="10" height="52" fill="#374151" />
      <rect x="374" y={forkY} width="78" height="6" fill="#374151" />
      <Pallet x={380} y={forkY - 12} w={64} />
      <Box x={382} y={forkY - 40} w={30} />
      <Box x={412} y={forkY - 40} w={30} />
      <Box x={396} y={forkY - 68} w={30} />
      {unsafe("underForks") && <Person x={412} y={398} helmet="#facc15" vest shirt="#64748b" hands={[[-20, -54], [12, -92]]} />}

      {/* the pallet truck, parked in its place (a look-alike) */}
      <rect x="202" y="398" width="148" height="86" fill="none" stroke="#eab308" stroke-width="3" stroke-dasharray="10 6" />
      <rect x="214" y="464" width="106" height="9" fill="#dc2626" />
      <rect x="318" y="440" width="20" height="34" rx="3" fill="#dc2626" />
      <path d="M330 440 L322 402" stroke-width="5" />
      <rect x="308" y="396" width="28" height="7" rx="3" fill="#111827" />
      <circle cx="330" cy="476" r="7" fill={INK} />
      <circle cx="222" cy="476" r="4" fill={INK} />

      {/* the can: tipped over and spilled, or upright in a drip tray */}
      {unsafe("spill") ? (
        <g>
          <path d="M574 444 C600 430 646 436 650 450 C656 466 616 476 588 470 C556 466 538 456 574 444 Z" fill="#93c5fd" stroke="#3b82f6" />
          <rect x="528" y="428" width="48" height="26" rx="4" fill="#2563eb" />
          <ellipse cx="576" cy="441" rx="5" ry="13" fill="#1e3a8a" />
        </g>
      ) : (
        <g>
          <rect x="560" y="452" width="52" height="10" fill="#64748b" />
          <rect x="570" y="416" width="32" height="38" rx="4" fill="#2563eb" />
          <ellipse cx="586" cy="416" rx="16" ry="4" fill="#1e40af" />
        </g>
      )}

      {/* the pallet on the floor: broken, or whole */}
      {unsafe("damagedPallet") ? (
        <g>
          <path d="M40 462 H96 L104 470 H40 Z" fill="#b7791f" />
          <path d="M110 470 L118 462 H172 V468 H110 Z" fill="#b7791f" />
          <rect x="40" y="470" width="12" height="10" fill="#b7791f" />
          <rect x="160" y="468" width="12" height="12" fill="#b7791f" />
          <path d="M98 472 l6 8 l4 -6 l6 6" fill="none" stroke-width="2.5" />
          <Box x={44} y={434} w={42} />
          <Box x={86} y={436} w={42} r={4} />
          <Box x={128} y={432} w={42} r={-5} />
          <Box x={64} y={406} w={42} r={3} />
          <Box x={108} y={404} w={42} r={-7} />
        </g>
      ) : (
        <g>
          <rect x="40" y="462" width="132" height="6" fill="#b7791f" />
          {[40, 100, 160].map((x) => <rect key={x} x={x} y="468" width="12" height="12" fill="#b7791f" />)}
          <Box x={44} y={434} w={42} />
          <Box x={86} y={434} w={42} />
          <Box x={128} y={434} w={42} />
          <Box x={64} y={406} w={42} />
          <Box x={106} y={406} w={42} />
        </g>
      )}
    </g>
  );
}

// ---- the kitchen ----

function Kitchen({ unsafe, t }: SceneProps) {
  const tiles: string[] = [];
  for (let y = 152; y < 236; y += 28) tiles.push(`M0 ${y} H800`);
  for (let x = 40; x < 800; x += 40) tiles.push(`M${x} 124 V236`);
  const floor: string[] = [];
  for (let y = 384; y < 500; y += 40) floor.push(`M0 ${y} H800`);
  for (let x = 50; x < 800; x += 50) floor.push(`M${x} 344 V500`);
  return (
    <g stroke={INK} stroke-width="2" stroke-linejoin="round">
      <rect width="800" height="344" fill="#fdf6e3" stroke="none" />
      <rect y="124" width="800" height="112" fill="#e0f2fe" stroke="none" />
      <path d={tiles.join(" ")} stroke="#bfdbfe" stroke-width="1.5" />
      <rect y="344" width="800" height="156" fill="#e5e7eb" stroke="none" />
      <path d={floor.join(" ")} stroke="#cbd5e1" stroke-width="1.5" />

      {/* cupboards and the hood */}
      <rect x="20" y="18" width="306" height="94" fill="#a7c4a0" />
      <path d="M122 18 V112 M224 18 V112" />
      {[110, 134, 212, 236].map((x) => <circle key={x} cx={x} cy="90" r="3.5" fill="#fff" />)}
      <rect x="600" y="18" width="190" height="94" fill="#a7c4a0" />
      <path d="M695 18 V112" />
      {[683, 707].map((x) => <circle key={x} cx={x} cy="90" r="3.5" fill="#fff" />)}
      <rect x="478" y="0" width="44" height="70" fill="#9ca3af" />
      <path d="M440 118 L462 70 H538 L560 118 Z" fill="#d1d5db" />

      {/* the fire blanket (a look-alike) */}
      <rect x="344" y="44" width="56" height="62" rx="5" fill="#dc2626" />
      <Label x={372} y={70} size={10}>{t.fireBlanket[0]}</Label>
      <Label x={372} y={84} size={10}>{t.fireBlanket[1]}</Label>
      <rect x="352" y="106" width="9" height="10" fill="#111827" />
      <rect x="383" y="106" width="9" height="10" fill="#111827" />

      {/* the worktop and the cupboards below */}
      <rect x="-2" y="252" width="804" height="92" fill="#fafaf9" />
      {[108, 206, 304, 610, 700].map((x) => <path key={x} d={`M${x} 252 V344`} />)}
      {[96, 120, 194, 218, 292, 316, 598, 622, 688, 712].map((x) => <circle key={x} cx={x} cy="270" r="3" fill="#9ca3af" />)}
      <rect x="-2" y="236" width="804" height="16" fill="#d6d3d1" />
      <path d="M0 245 H800" stroke="#a8a29e" stroke-width="1.5" />

      {/* the sink and the mixer: its cable over the sink, or short to a socket beside it */}
      <path d="M104 216 V196 Q104 184 116 184 H134 Q142 184 142 192 V198" fill="none" stroke="#6b7280" stroke-width="7" stroke-linecap="round" />
      <rect x="96" y="212" width="18" height="6" fill="#6b7280" />
      <path d="M50 214 H170 L162 244 H58 Z" fill="#cbd5e1" />
      <path d="M56 222 H164 L160 240 H60 Z" fill="#60a5fa" stroke="none" />
      <path d="M70 228 q8 -4 16 0 M120 232 q8 -4 16 0" fill="none" stroke="#fff" stroke-width="2" />
      <path d="M48 214 H172" stroke-width="3" />
      <path d="M190 180 H218 L214 220 H194 Z" fill="#bae6fd" />
      <rect x="188" y="174" width="32" height="8" rx="3" fill="#475569" />
      <rect x="184" y="218" width="40" height="26" rx="5" fill="#e11d48" />
      {unsafe("cable") ? (
        <g>
          <rect x="26" y="192" width="28" height="22" rx="3" fill="#fff" />
          <rect x="34" y="198" width="12" height="12" rx="2" fill="#111827" />
          <path d="M40 210 C44 196 70 198 80 214 C88 228 104 236 118 232 C134 228 150 214 166 214 C176 214 180 226 184 232" fill="none" stroke="#111827" stroke-width="3.5" />
        </g>
      ) : (
        <g>
          <rect x="226" y="192" width="28" height="22" rx="3" fill="#fff" />
          <rect x="234" y="198" width="12" height="12" rx="2" fill="#111827" />
          <path d="M224 236 C234 236 240 226 240 210" fill="none" stroke="#111827" stroke-width="3.5" />
        </g>
      )}

      {/* the cutting board and the knife */}
      <rect x="252" y="228" width="94" height="12" rx="3" fill="#d4a373" />
      {[268, 284].map((x) => <circle key={x} cx={x} cy="228" r="6" fill="#ef4444" stroke-width="1.5" />)}
      {unsafe("knife") ? (
        <g transform="rotate(30 340 236)">
          <path d="M300 236 Q306 230 340 231 V239 H306 Z" fill="#e5e7eb" />
          <rect x="340" y="230" width="32" height="10" rx="3" fill="#111827" />
        </g>
      ) : (
        <g>
          <path d="M290 226 Q296 220 326 221 V228 H296 Z" fill="#e5e7eb" />
          <rect x="326" y="220" width="22" height="9" rx="3" fill="#111827" />
        </g>
      )}

      {/* the stove: the pan at the front (its handle out or in) and the pot at the back (a look-alike) */}
      <rect x="420" y="230" width="160" height="8" fill="#111827" />
      <rect x="512" y="186" width="62" height="46" rx="4" fill="#94a3b8" />
      <ellipse cx="543" cy="186" rx="33" ry="6" fill="#cbd5e1" />
      <rect x="505" y="196" width="8" height="6" rx="2" fill="#475569" />
      <rect x="573" y="196" width="8" height="6" rx="2" fill="#475569" />
      <path d="M452 206 q4 -8 0 -16 M466 204 q4 -8 0 -16" fill="none" stroke="#9ca3af" stroke-width="2" />
      <rect x="432" y="212" width="62" height="20" rx="4" fill="#4b5563" />
      {unsafe("panHandle") ? (
        <path d="M434 220 L392 256" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      ) : (
        <path d="M490 216 L502 200" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      )}

      {/* the oven: open or closed */}
      {unsafe("oven") ? (
        <g>
          <rect x="424" y="254" width="152" height="86" fill="#111827" />
          <path d="M436 266 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8" fill="none" stroke="#f97316" stroke-width="3" />
          <path d="M432 306 H568" stroke="#6b7280" stroke-width="3" />
          <path d="M424 340 H576 L596 396 H404 Z" fill="#374151" />
          <path d="M442 350 H558 L570 384 H430 Z" fill="#111827" stroke="#6b7280" />
          <rect x="410" y="388" width="180" height="6" rx="3" fill="#d1d5db" />
        </g>
      ) : (
        <g>
          <rect x="424" y="254" width="152" height="86" fill="#374151" />
          <rect x="440" y="260" width="120" height="7" rx="3" fill="#d1d5db" />
          <rect x="444" y="276" width="112" height="54" rx="4" fill="#111827" />
          <rect x="444" y="276" width="112" height="54" rx="4" fill="#f97316" opacity="0.18" stroke="none" />
        </g>
      )}

      {/* the wet floor, with or without a sign */}
      <path d="M170 418 C176 404 236 404 262 414 C290 424 278 444 240 444 C206 446 162 436 170 418 Z" fill="#bfdbfe" stroke="#60a5fa" />
      <path d="M196 420 q12 -6 24 0 M238 428 q8 -4 16 0" fill="none" stroke="#fff" stroke-width="2.5" />
      {!unsafe("wetFloor") && (
        <g>
          <path d="M296 372 H332 L344 448 H284 Z" fill="#facc15" />
          <path d="M314 380 L328 404 H300 Z" fill="none" stroke-width="2.5" />
          <Label x={314} y={402} size={13} fill={INK}>!</Label>
          <Label x={314} y={420} size={9} fill={INK}>{t.wetFloor[0]}</Label>
          <Label x={314} y={432} size={9} fill={INK}>{t.wetFloor[1]}</Label>
        </g>
      )}

      {/* the bread, and next to it the cleaning agent or the oil */}
      <rect x="608" y="232" width="84" height="8" rx="2" fill="#d4a373" />
      <path d="M614 232 C612 204 686 200 688 232 Z" fill="#d97706" />
      <path d="M632 214 l8 10 M650 210 l8 12 M668 212 l7 10" stroke="#92400e" fill="none" />
      {unsafe("cleaner") ? (
        <g>
          <rect x="698" y="196" width="24" height="44" rx="5" fill="#a78bfa" />
          <rect x="704" y="186" width="12" height="11" fill="#fff" />
          <path d="M700 172 H724 L728 180 H716 V188 H704 Z" fill="#fff" />
          <path d="M704 186 L698 196" stroke-width="2" />
          <rect x="701" y="206" width="18" height="22" fill="#fff" stroke-width="1.5" />
          <path d="M710 208 L718 217 L710 226 L702 217 Z" fill="#fff" stroke="#dc2626" stroke-width="2" />
          <Label x={710} y={221} size={9} fill={INK}>!</Label>
        </g>
      ) : (
        <g>
          <path d="M700 240 V204 Q700 194 706 190 V174 H714 V190 Q720 194 720 204 V240 Z" fill="#eab308" />
          <rect x="705" y="168" width="10" height="7" fill="#92400e" />
          <rect x="702" y="208" width="16" height="16" fill="#fff" stroke-width="1.5" />
          <Label x={710} y={219} size={6} fill={INK}>{t.oil}</Label>
        </g>
      )}

      {/* the knife block (a look-alike) */}
      <path d="M750 180 l4 22 M760 176 l2 24 M770 180 l-2 22" stroke="#111827" stroke-width="6" stroke-linecap="round" />
      <path d="M738 240 H782 L778 202 L746 196 Z" fill="#a16207" />
    </g>
  );
}

// ---- the workshop ----

function Workshop({ unsafe, t }: SceneProps) {
  const holes: string[] = [];
  for (let y = 58; y < 170; y += 14) for (let x = 34; x < 204; x += 14) holes.push(`M${x} ${y} h0.1`);
  const bottle = (x: number, tilt: boolean, chained: boolean) => (
    <g>
      {chained && <rect x={x - 6} y="282" width="8" height="16" fill="#6b7280" />}
      <g transform={tilt ? `rotate(-8 ${x} 390)` : undefined}>
        <path d={`M${x} 390 V252 Q${x} 236 ${x + 17} 236 Q${x + 34} 236 ${x + 34} 252 V390 Z`} fill="#475569" />
        <path d={`M${x} 262 V252 Q${x} 236 ${x + 17} 236 Q${x + 34} 236 ${x + 34} 252 V262 Z`} fill="#b91c1c" />
        <rect x={x + 10} y="220" width="14" height="17" fill="#9ca3af" />
        <rect x={x + 6} y="214" width="22" height="7" rx="2" fill="#6b7280" />
      </g>
      {chained && <path d={`M${x - 4} 290 H${x + 38}`} stroke="#6b7280" stroke-width="5" stroke-dasharray="6 3" />}
      {chained && <rect x={x + 34} y="282" width="8" height="16" fill="#6b7280" />}
    </g>
  );
  return (
    <g stroke={INK} stroke-width="2" stroke-linejoin="round">
      <rect width="800" height="366" fill="#e7e5e4" stroke="none" />
      <rect y="366" width="800" height="134" fill="#d6d3d1" stroke="none" />
      <path d="M0 366 H800" />
      <path d="M0 410 H800 M0 496 H800" stroke="#eab308" stroke-width="6" />

      {/* the tool board (a look-alike) */}
      <rect x="24" y="48" width="184" height="126" rx="3" fill="#d6b88b" />
      <path d={holes.join(" ")} stroke="#a58a5f" stroke-width="3.5" stroke-linecap="round" />
      <rect x="44" y="66" width="8" height="60" rx="2" fill="#92400e" />
      <rect x="34" y="62" width="28" height="12" rx="2" fill="#6b7280" />
      <path d="M86 64 V122 M80 64 a6 6 0 1 0 12 0" fill="none" stroke="#6b7280" stroke-width="6" stroke-linecap="round" />
      <rect x="112" y="64" width="9" height="30" rx="3" fill="#eab308" />
      <path d="M116.5 94 V132" stroke="#6b7280" stroke-width="4" />
      <path d="M146 66 H190 L190 80 L146 110 Z" fill="#cbd5e1" />
      <rect x="138" y="62" width="14" height="22" rx="3" fill="#b91c1c" />
      <path d="M160 128 l12 34 M184 128 l-12 34" stroke="#dc2626" stroke-width="5" stroke-linecap="round" />

      {/* the first aid kit (a look-alike) */}
      <path d="M596 92 V84 Q596 80 600 80 H620 Q624 80 624 84 V92" fill="none" stroke-width="4" />
      <rect x="574" y="90" width="72" height="54" rx="7" fill="#15803d" />
      <Label x={610} y={t.firstAid.length > 5 ? 116 : 122} size={t.firstAid.length > 5 ? 12 : 16}>{t.firstAid.split(" ")[0]}</Label>
      {t.firstAid.includes(" ") && <Label x={610} y={132} size={12}>{t.firstAid.split(" ")[1]}</Label>}

      {/* the gas bottles: the left one free (and leaning) or chained, the right one chained (a look-alike) */}
      {bottle(664, unsafe("gasBottle"), !unsafe("gasBottle"))}
      {bottle(736, false, true)}

      {/* the workbench and the grinder */}
      <rect x="30" y="322" width="12" height="76" fill="#92400e" />
      <rect x="318" y="322" width="12" height="76" fill="#92400e" />
      <rect x="30" y="368" width="300" height="7" fill="#92400e" />
      <rect x="20" y="310" width="320" height="12" fill="#b7791f" />
      <rect x="236" y="300" width="56" height="10" fill="#475569" />
      <rect x="244" y="258" width="40" height="44" rx="9" fill="#64748b" />
      <circle cx="220" cy="280" r="22" fill="#a8a29e" />
      <circle cx="220" cy="280" r="6" fill="#6b7280" />
      <circle cx="308" cy="280" r="22" fill="#a8a29e" />
      <circle cx="308" cy="280" r="6" fill="#6b7280" />
      <path d="M200 286 L178 276 M198 292 L174 296 M204 296 L188 312 M196 280 L184 264" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" />
      {!unsafe("grinderGuard") && (
        <g>
          {[220, 308].map((cx) => (
            <path key={cx} d={`M${cx - 28} 286 A28 28 0 1 1 ${cx + 28} 286 H${cx + 22} A22 22 0 1 0 ${cx - 22} 286 Z`} fill="#475569" />
          ))}
          <rect x="196" y="236" width="30" height="16" rx="2" fill="#bae6fd" opacity="0.8" />
          <rect x="284" y="236" width="30" height="16" rx="2" fill="#bae6fd" opacity="0.8" />
        </g>
      )}
      <Person x={150} y={398} s={1.4} shirt="#2563eb" trousers="#1e3a8a" goggles={!unsafe("goggles")} hands={[[21, -73], [33, -79]]} />

      {/* the drill press (a look-alike: it has a guard) and the person at it */}
      <rect x="420" y="384" width="100" height="12" fill="#15803d" />
      <rect x="462" y="196" width="12" height="190" fill="#9ca3af" />
      <rect x="432" y="314" width="74" height="8" fill="#6b7280" />
      <rect x="452" y="304" width="38" height="10" fill="#d4a373" />
      <rect x="486" y="160" width="30" height="26" rx="4" fill="#166534" />
      <rect x="428" y="176" width="84" height="62" rx="8" fill="#15803d" />
      <path d="M512 208 L542 196 M512 214 L538 228" stroke-width="4" />
      <circle cx="543" cy="195" r="5" fill="#111827" />
      <circle cx="539" cy="229" r="5" fill="#111827" />
      <rect x="462" y="238" width="12" height="20" fill="#6b7280" />
      <path d="M468 258 V290" stroke-width="3" />
      <rect x="448" y="236" width="40" height="48" rx="4" fill="#bae6fd" opacity="0.55" stroke="#0369a1" />
      <Person x={560} y={398} s={1.4} shirt={unsafe("clothing") ? "#7c3aed" : "#1e3a8a"} trousers="#334155" hair="#111827" scarf={unsafe("clothing")} hands={[[-40, -66], [-34, -62]]} />

      {/* the cables: loose across the walkway, or under a cable protector */}
      <rect x="370" y="336" width="22" height="18" rx="3" fill="#fff" />
      {unsafe("cables") ? (
        <g fill="none" stroke-width="3.5">
          <path d="M376 352 C376 384 330 400 324 424 C318 446 380 452 352 472 C330 488 270 482 250 498" stroke="#111827" />
          <path d="M386 352 C390 380 430 392 424 420 C418 444 470 452 494 466" stroke="#f97316" />
          <circle cx="512" cy="470" r="18" fill="#f97316" stroke={INK} />
          <circle cx="512" cy="470" r="7" fill="#fff" stroke={INK} />
        </g>
      ) : (
        <g>
          <path d="M381 352 V412" fill="none" stroke="#111827" stroke-width="3.5" />
          <rect x="362" y="410" width="38" height="86" rx="4" fill="#facc15" />
          <path d="M362 430 l38 -14 M362 452 l38 -14 M362 474 l38 -14 M362 496 l38 -14" stroke="#111827" stroke-width="5" />
          <rect x="362" y="410" width="38" height="86" rx="4" fill="none" />
        </g>
      )}
    </g>
  );
}

const SCENE_DRAWINGS: Record<SceneId, (props: SceneProps) => preact.JSX.Element> = {
  scaffold: Scaffold,
  warehouse: Warehouse,
  kitchen: Kitchen,
  workshop: Workshop,
};

/** The picture of a scene, with every hazard in `unsafe` drawn unsafe and the others safe. */
export function ScenePicture({ scene, unsafe, t }: { scene: SceneId; unsafe: Set<string>; t: PictureTexts }) {
  const Drawing = SCENE_DRAWINGS[scene];
  return <Drawing unsafe={(id) => unsafe.has(id)} t={t} />;
}
