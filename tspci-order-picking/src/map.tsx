/*
 * The warehouse seen from above (SVG): the aisles going up from the front corridor, a rack on both sides of every
 * rack position, its code written on it ("A-03"), dispatch at the front on the left, the roll cage where the pupil is,
 * and in the route task the way walked. Every rack is a button: a tap or a click goes there, and the keyboard moves
 * between the racks with the arrow keys (one tab stop for the whole map) and goes with Enter or Space.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { Layout, aisleLetter, parseRack, rackCode, rackPosition } from "./picking";
import type { Texts } from "./texts";

const PAD = 8;
const DISPATCH_W = 74;
const RACK_W = 56;
const WALKWAY_W = 42;
const GROUP_GAP = 10;
const GROUP_W = 2 * RACK_W + WALKWAY_W;
const POS_H = 48;
const BACK_H = 34;
const FRONT_H = 46;
const LABEL_H = 22;

/** Where everything of a layout is on the map, in pixels of the SVG. */
export function geometry(layout: Layout) {
  const top = PAD + (layout.back ? BACK_H : 6);
  const racksBottom = top + layout.depth * POS_H;
  const groupX = (aisle: number) => PAD + DISPATCH_W + aisle * (GROUP_W + GROUP_GAP);
  const aisleX = (aisle: number) => groupX(aisle) + RACK_W + WALKWAY_W / 2;
  const posY = (pos: number) => top + (layout.depth - pos) * POS_H + POS_H / 2;
  const frontY = racksBottom + FRONT_H / 2;
  const backY = PAD + BACK_H / 2;
  return {
    width: groupX(layout.aisles) - GROUP_GAP + PAD,
    height: racksBottom + FRONT_H + LABEL_H + PAD,
    top,
    racksBottom,
    groupX,
    aisleX,
    posY,
    frontY,
    backY,
    dispatch: { x: PAD + 4, y: racksBottom + 4, width: DISPATCH_W - 16, height: FRONT_H - 8 },
    /** The rectangle of a rack. */
    rack: (aisle: number, rack: number) => {
      const { pos, side } = rackPosition(rack);
      const x = side === "left" ? groupX(aisle) : groupX(aisle) + RACK_W + WALKWAY_W;
      return { x, y: top + (layout.depth - pos) * POS_H + 3, width: RACK_W, height: POS_H - 6 };
    },
    /** A point of the aisle graph (steps, picking.ts graphOf) in pixels. */
    point: ({ x, y }: { x: number; y: number }) => ({
      x: x === 0 ? PAD + DISPATCH_W / 2 - 4 : aisleX(Math.round((x - 2) / 3)),
      y: y === 0 ? frontY : y > layout.depth ? backY : posY(y),
    }),
  };
}

type Props = {
  layout: Layout;
  t: Texts;
  /** The rack the pupil is at ("A-03"); none: at dispatch. */
  at?: string;
  /** The way walked, in steps (picking.ts walkPoints): drawn as a dashed line. */
  path?: { x: number; y: number }[];
  /** Go to a rack; without it the map only shows. */
  onGo?: (rack: string) => void;
  /** Racks to mark with a dot and a number (the authoring mode: how many products a rack holds). */
  counts?: Record<string, number>;
  /** The roll cage is drawn where the pupil is (not in the authoring mode). */
  cart?: boolean;
};

export function WarehouseMap({ layout, t, at, path, onGo, counts, cart = true }: Props) {
  const g = geometry(layout);
  const racks = Array.from({ length: layout.aisles }, (_, aisle) =>
    Array.from({ length: 2 * layout.depth }, (_, r) => ({ aisle, rack: r + 1, code: rackCode(aisle, r + 1) }))
  ).flat();
  const [focus, setFocus] = useState(at ?? racks[0]?.code);
  const svg = useRef<SVGSVGElement>(null);
  // a rack removed from the layout (authoring mode): the tab stop goes back to the first one
  const focusCode = racks.some((r) => r.code === focus) ? focus : racks[0]?.code;
  useEffect(() => {
    if (at) setFocus(at);
  }, [at]);

  const interactive = !!onGo;
  const moveFocus = (code: string, key: string) => {
    const r = parseRack(code);
    if (!r) return;
    const { pos, side } = rackPosition(r.rack);
    let column = r.aisle * 2 + (side === "right" ? 1 : 0);
    let row = pos;
    if (key === "ArrowLeft") column--;
    else if (key === "ArrowRight") column++;
    else if (key === "ArrowUp") row++;
    else if (key === "ArrowDown") row--;
    else if (key === "Home") column = 0;
    else if (key === "End") column = layout.aisles * 2 - 1;
    column = Math.max(0, Math.min(layout.aisles * 2 - 1, column));
    row = Math.max(1, Math.min(layout.depth, row));
    const next = rackCode(Math.floor(column / 2), 2 * row - (column % 2 === 0 ? 1 : 0));
    setFocus(next);
    svg.current?.querySelector<SVGGElement>(`[data-rack="${next}"]`)?.focus();
  };

  const here = at ? parseRack(at) : undefined;
  const cartAt = here ? { x: g.aisleX(here.aisle), y: g.posY(rackPosition(here.rack).pos) } : g.point({ x: 0, y: 0 });
  const points = (path ?? []).map(g.point);

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${g.width} ${g.height}`}
      className="warehouse-map block h-auto w-full"
      style={{ maxWidth: `${g.width * 1.25}px` }}
      role="group"
      aria-label={t.warehouse}
    >
      {/* the floor and the walls */}
      <rect x="1" y="1" width={g.width - 2} height={g.height - LABEL_H - 2} rx="6" className="floor" />
      {layout.back && <rect x={PAD + DISPATCH_W - 6} y={PAD} width={g.width - DISPATCH_W - 2 * PAD + 6} height={BACK_H - 4} rx="4" className="corridor" />}
      <rect x={PAD} y={g.racksBottom + 2} width={g.width - 2 * PAD} height={FRONT_H - 4} rx="4" className="corridor" />
      {Array.from({ length: layout.aisles }, (_, aisle) => (
        <g key={aisle}>
          <rect x={g.groupX(aisle) + RACK_W} y={g.top} width={WALKWAY_W} height={g.racksBottom - g.top} className="corridor" />
          <text x={g.aisleX(aisle)} y={g.height - LABEL_H + 14} className="aisle-label" text-anchor="middle">
            {t.aisle(aisleLetter(aisle))}
          </text>
        </g>
      ))}

      {/* dispatch */}
      <g aria-hidden="true">
        <rect {...g.dispatch} rx="4" className="dispatch" />
        <text x={g.dispatch.x + g.dispatch.width / 2} y={g.height - LABEL_H + 14} className="aisle-label" text-anchor="middle">
          {t.dispatch}
        </text>
      </g>

      {/* the racks */}
      {racks.map(({ aisle, rack, code }) => {
        const box = g.rack(aisle, rack);
        const { side } = rackPosition(rack);
        const current = at === code;
        const name = t.rackName(code, aisleLetter(aisle), side);
        const count = counts?.[code] ?? 0;
        return (
          <g
            key={code}
            data-rack={code}
            className={`rack ${interactive ? "rack-button" : ""} ${current ? "rack-current" : ""}`}
            {...(interactive
              ? {
                  role: "button",
                  // lower case: on an SVG element the attribute name is case-sensitive
                  tabindex: code === focusCode ? 0 : -1,
                  "aria-label": name,
                  "aria-current": current ? ("location" as const) : undefined,
                  onClick: () => {
                    setFocus(code);
                    onGo(code);
                  },
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onGo(code);
                    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                      e.preventDefault();
                      moveFocus(code, e.key);
                    }
                  },
                  onFocus: () => setFocus(code),
                }
              : { "aria-hidden": "true" as const })}
          >
            <rect {...box} rx="3" className="rack-body" />
            <path d={`M${box.x + 3} ${box.y + box.height / 3}h${box.width - 6}M${box.x + 3} ${box.y + (2 * box.height) / 3}h${box.width - 6}`} className="rack-shelves" />
            <rect x={box.x + 3} y={box.y + box.height / 2 - 10} width={box.width - 6} height="20" rx="3" className="rack-tag" />
            <text x={box.x + box.width / 2} y={box.y + box.height / 2 + 5} className="rack-code" text-anchor="middle">
              {code}
            </text>
            {count > 0 && (
              <g>
                <circle cx={box.x + box.width - 5} cy={box.y + 5} r="7" className="rack-count" />
                <text x={box.x + box.width - 5} y={box.y + 8.5} className="rack-count-text" text-anchor="middle">
                  {count}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* the way walked */}
      {points.length > 1 && (
        <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} className="walk" aria-hidden="true" />
      )}

      {/* the roll cage, where the pupil is */}
      {cart && (
        <g transform={`translate(${cartAt.x - 13} ${cartAt.y - 13})`} aria-hidden="true" className="cart-icon">
          <rect x="1" y="1" width="24" height="20" rx="2" className="cart-frame" />
          <path d="M1 8h24M1 14h24M9 1v20M17 1v20" className="cart-mesh" />
          <circle cx="6" cy="23.5" r="2.5" className="cart-wheel" />
          <circle cx="20" cy="23.5" r="2.5" className="cart-wheel" />
        </g>
      )}
    </svg>
  );
}
