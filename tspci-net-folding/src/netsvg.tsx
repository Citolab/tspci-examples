// The net on the page, in SVG: the faces with their labels (letters, the pips of a die, or a colour with a pattern
// and its name), the grid to build on (a grid with an active cell), a net with faces to choose or fill in, and the
// solid seen from a corner for the complete mode.
import { useRef, useState } from "preact/hooks";
import { COLORS, COLOR_HEX, Face, LabelKind, Side, Solid, analyze, centroid, faceAt, faceId, extent, nearestSide, polygon, type P2 } from "./net";
import { Texts } from "./texts";

export type Look = "plain" | "chosen" | "asked" | "blank" | "overlap" | "correct";

const PIPS: Record<string, number[]> = { "1": [4], "2": [2, 6], "3": [2, 4, 6], "4": [0, 2, 6, 8], "5": [0, 2, 4, 6, 8], "6": [0, 2, 3, 5, 6, 8] };

/** The patterns that go with the colours (the same ones as on the 3D faces). */
export const Patterns = ({ uid }: { uid: string }) => (
  <defs>
    {COLORS.map((c, i) => (
      <pattern key={c} id={`${uid}-p-${c}`} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill={COLOR_HEX[c]} />
        {i % 6 === 0 && <path d="M-2 10 L10 -2" stroke="rgba(15,23,42,.35)" stroke-width="1.6" />}
        {i % 6 === 1 && <circle cx="4" cy="4" r="1.4" fill="rgba(15,23,42,.35)" />}
        {i % 6 === 2 && <path d="M0 4 H8" stroke="rgba(15,23,42,.35)" stroke-width="1.6" />}
        {i % 6 === 3 && <path d="M4 0 V8" stroke="rgba(15,23,42,.35)" stroke-width="1.6" />}
        {i % 6 === 4 && <path d="M0 0 L8 8 M8 0 L0 8" stroke="rgba(15,23,42,.35)" stroke-width="1.2" />}
      </pattern>
    ))}
  </defs>
);

const points = (poly: P2[], scale: number) => poly.map(([x, y]) => `${x * scale},${y * scale}`).join(" ");

/** One face: its shape, fill and label; scale is pixels per cell. */
export const FaceShape = ({ face, kind, look, scale, uid, t, label }: {
  face: Face; kind: LabelKind; look: Look; scale: number; uid: string; t: Texts; label?: string;
}) => {
  const poly = polygon(face);
  const [cx, cy] = centroid(poly).map((v) => v * scale);
  const text = label ?? face.label ?? "";
  const isColor = kind === "colors" && COLORS.includes(text as (typeof COLORS)[number]);
  const fill = isColor ? `url(#${uid}-p-${text})` : look === "blank" ? "#f1f5f9" : look === "chosen" ? "#dbeafe" : look === "correct" ? "#dcfce7" : "#fffdf7";
  const size = Math.min(scale, scale * (face.w ?? 1), scale * (face.h ?? 1));
  return (
    <g className="nf-face" data-look={look}>
      <polygon points={points(poly, scale)} fill={fill} stroke={look === "chosen" ? "#1d4ed8" : look === "overlap" ? "#b91c1c" : "#334155"}
        stroke-width={look === "chosen" || look === "asked" ? 3.5 : 1.5} stroke-dasharray={look === "asked" ? "6 4" : undefined} stroke-linejoin="round" />
      {text && kind === "dots" && PIPS[text] &&
        PIPS[text].map((k) => <circle key={k} cx={cx + ((k % 3) - 1) * size * 0.22} cy={cy + (Math.floor(k / 3) - 1) * size * 0.22} r={size * 0.075} fill="#1e293b" />)}
      {text && kind === "colors" && (
        <g>
          <rect x={cx - size * 0.42} y={cy - size * 0.13} width={size * 0.84} height={size * 0.26} rx="3" fill="rgba(255,255,255,.92)" />
          <text x={cx} y={cy + 0.5} text-anchor="middle" dominant-baseline="middle" font-size={Math.max(8, size * 0.17)} font-weight="600" fill="#1e293b">{t.color[text] ?? text}</text>
        </g>
      )}
      {text && kind === "letters" && (
        <text x={cx} y={cy + 1} text-anchor="middle" dominant-baseline="middle" font-size={size * 0.48} font-weight="700" fill="#1e293b">{text}</text>
      )}
      {!text && look === "blank" && <text x={cx} y={cy + 1} text-anchor="middle" dominant-baseline="middle" font-size={size * 0.36} font-weight="700" fill="#64748b">?</text>}
      {look === "chosen" && (
        <g data-testid="chosen-mark">
          <circle cx={cx + size * 0.3} cy={cy - size * 0.3} r={size * 0.14} fill="#1d4ed8" stroke="#fff" stroke-width="1.5" />
          <path d={`M${cx + size * 0.235} ${cy - size * 0.3} l${size * 0.045} ${size * 0.05} l${size * 0.09} -${size * 0.1}`} stroke="#fff" stroke-width={Math.max(1.5, size * 0.04)} fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      )}
      {look === "correct" && <path d={`M${cx + size * 0.18} ${cy - size * 0.34} l${size * 0.06} ${size * 0.06} l${size * 0.12} -${size * 0.12}`} stroke="#15803d" stroke-width="2.5" fill="none" />}
    </g>
  );
};

/** How a screen reader names a face. */
export const faceName = (t: Texts, faces: Face[], i: number, kind: LabelKind, label?: string) =>
  t.faceName(i + 1, label ?? faces[i].label ?? "", kind, t);

/** How a screen reader names what a cell holds. */
const cellContent = (t: Texts, f: Face | undefined, x: number, y: number) => {
  if (!f) return t.empty;
  if (f.base) return t.triangle(t.sideName[f.base]);
  const w = f.w ?? 1, h = f.h ?? 1;
  const shape = w === 1 && h === 1 ? t.square : t.rectangle(w, h);
  return f.x === x && f.y === y ? shape : `${shape} (${t.cell(f.y + 1, f.x + 1).toLowerCase()})`;
};

/**
 * The grid to build a net on: a grid with an active cell (aria-activedescendant). Arrows move, Enter or Space put
 * the chosen piece in the cell or take the face away, R turns, Delete takes away.
 */
export const NetGrid = ({ faces, columns, rows, kind, t, uid, label, readOnly, selected, looks, onActivate, onTurn, onRemove, onFocusCell }: {
  faces: Face[]; columns: number; rows: number; kind: LabelKind; t: Texts; uid: string; label: string; readOnly?: boolean;
  /** the face shown as chosen (picked in 3D, or chosen by the author) */
  selected?: number;
  looks?: Look[];
  onActivate: (x: number, y: number, hint?: Side) => void;
  onTurn: (x: number, y: number) => void;
  onRemove: (x: number, y: number) => void;
  onFocusCell?: (x: number, y: number) => void;
}) => {
  const [active, setActive] = useState<[number, number]>([0, 0]);
  const grid = useRef<HTMLDivElement>(null);
  const scale = Math.max(30, Math.min(52, Math.floor(460 / Math.max(columns, rows))));
  const [ax, ay] = [Math.min(active[0], columns - 1), Math.min(active[1], rows - 1)];
  const move = (x: number, y: number) => {
    const next: [number, number] = [Math.max(0, Math.min(columns - 1, x)), Math.max(0, Math.min(rows - 1, y))];
    setActive(next);
    onFocusCell?.(...next);
  };
  const keydown = (e: KeyboardEvent) => {
    const k = e.key;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[k]) move(ax + moves[k][0], ay + moves[k][1]);
    else if (k === "Home") move(0, ay);
    else if (k === "End") move(columns - 1, ay);
    else if (readOnly) return;
    else if (k === "Enter" || k === " ") onActivate(ax, ay);
    else if (k === "r" || k === "R") onTurn(ax, ay);
    else if (k === "Delete" || k === "Backspace") onRemove(ax, ay);
    else return;
    e.preventDefault();
  };
  const cellId = (x: number, y: number) => `${uid}-c-${x}-${y}`;
  return (
    <div className="relative select-none" style={{ width: columns * scale + 2, height: rows * scale + 2 }}>
      <svg className="absolute inset-0" width={columns * scale + 2} height={rows * scale + 2} aria-hidden="true">
        <Patterns uid={uid} />
        <g transform="translate(1,1)">
          {Array.from({ length: columns + 1 }, (_, x) => <line key={`v${x}`} x1={x * scale} y1={0} x2={x * scale} y2={rows * scale} stroke="#e2e8f0" />)}
          {Array.from({ length: rows + 1 }, (_, y) => <line key={`h${y}`} x1={0} y1={y * scale} x2={columns * scale} y2={y * scale} stroke="#e2e8f0" />)}
          {faces.map((f, i) => <FaceShape key={i} face={f} kind={kind} look={looks?.[i] ?? (i === selected ? "chosen" : "plain")} scale={scale} uid={uid} t={t} />)}
          <rect x={ax * scale + 2} y={ay * scale + 2} width={scale - 4} height={scale - 4} rx="4" fill="none" stroke="#0284c7" stroke-width="2.5" className="nf-cursor" />
        </g>
      </svg>
      <div ref={grid} role="grid" aria-label={label} aria-readonly={readOnly ? "true" : undefined} tabIndex={0} aria-activedescendant={cellId(ax, ay)}
        className="nf-grid absolute inset-0 rounded outline-none" onKeyDown={keydown} data-testid="grid">
        {Array.from({ length: rows }, (_, y) => (
          <div role="row" key={y} className="flex" style={{ height: scale, marginTop: y === 0 ? 1 : 0, marginLeft: 1 }}>
            {Array.from({ length: columns }, (_, x) => {
              const f = faces[faceAt(faces, x, y)];
              return (
                <div key={x} id={cellId(x, y)} role="gridcell" aria-selected={x === ax && y === ay ? "true" : "false"} data-face={f ? "1" : undefined}
                  aria-label={`${t.cell(y + 1, x + 1)}: ${cellContent(t, f, x, y)}`} style={{ width: scale, height: scale }} className="cursor-pointer"
                  onClick={(e) => {
                    move(x, y);
                    grid.current?.focus();
                    if (readOnly) return;
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const hint = r.width ? nearestSide(((e as MouseEvent).clientX - r.left) / r.width, ((e as MouseEvent).clientY - r.top) / r.height) : undefined;
                    onActivate(x, y, hint);
                  }} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export type FaceRole = "radio" | "checkbox" | "button" | "none";

/**
 * A net to look at, with faces to choose (radio, checkbox) or fill in (button). The arrow keys move between the
 * faces that take part; Enter or Space choose; other keys go to onKey (labels in the complete mode).
 */
export const NetPicture = ({ faces, kind, t, uid, label, looks, roles, labels, names, readOnly, onFace, onKey, maxSize = 420 }: {
  faces: Face[]; kind: LabelKind; t: Texts; uid: string; label: string; looks: Look[]; roles: FaceRole[];
  labels?: string[]; names: string[]; readOnly?: boolean; maxSize?: number;
  onFace?: (i: number) => void;
  onKey?: (i: number, e: KeyboardEvent) => boolean;
}) => {
  const e = extent(faces);
  const scale = Math.max(24, Math.min(56, Math.floor(maxSize / Math.max(e.columns || 1, e.rows || 1))));
  const pad = 6;
  const refs = useRef<(SVGGElement | null)[]>([]);
  const interactive = roles.map((r, i) => (r !== "none" ? i : -1)).filter((i) => i >= 0);
  const focusNext = (i: number, step: number) => {
    const at = interactive.indexOf(i);
    const next = interactive[(at + step + interactive.length) % interactive.length];
    refs.current[next]?.focus();
  };
  const groupRole = roles.includes("radio") ? "radiogroup" : "group";
  return (
    <svg role={groupRole} aria-label={label} width={e.columns * scale + 2 * pad} height={e.rows * scale + 2 * pad} className="max-w-full overflow-visible" data-testid="net">
      <Patterns uid={uid} />
      <g transform={`translate(${pad - e.x * scale},${pad - e.y * scale})`}>
        {faces.map((f, i) => {
          const role = roles[i];
          const pressed = looks[i] === "chosen";
          const attrs: Record<string, unknown> = role === "none"
            ? { role: "img", "aria-label": names[i] }
            : {
              role, tabindex: 0, "aria-label": names[i], "aria-disabled": readOnly ? "true" : undefined,
              ...(role === "button" ? {} : { "aria-checked": pressed ? "true" : "false" }),
            };
          return (
            <g key={i} ref={(el) => { refs.current[i] = el; }} {...attrs} className={role !== "none" ? "nf-pick cursor-pointer outline-none" : undefined} data-face={faceId(i)}
              onClick={() => role !== "none" && !readOnly && onFace?.(i)}
              onKeyDown={(ev: KeyboardEvent) => {
                if (role === "none") return;
                if (ev.key === "ArrowRight" || ev.key === "ArrowDown") { focusNext(i, 1); ev.preventDefault(); return; }
                if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") { focusNext(i, -1); ev.preventDefault(); return; }
                if (readOnly) return;
                if (ev.key === "Enter" || ev.key === " ") { onFace?.(i); ev.preventDefault(); return; }
                if (onKey?.(i, ev)) ev.preventDefault();
              }}>
              <FaceShape face={f} kind={kind} look={looks[i]} scale={scale} uid={uid} t={t} label={labels?.[i]} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/**
 * The solid seen from one of its corners, with the three faces of that corner (turning order from net.ts): the
 * folded net projected along the sum of the three normals, the first face on top.
 */
export const ShownSolid = ({ faces, solid, corner, kind, t, uid, size = 200 }: {
  faces: Face[]; solid: Solid; corner: number[]; kind: LabelKind; t: Texts; uid: string; size?: number;
}) => {
  const a = analyze(faces, solid);
  // the scene's coordinates: (x, z, y) of the net's, as in the 3D view
  const s = (p: number[]) => [p[0], p[2], p[1]];
  const normals = a.fold.normals.map(s);
  const d = corner.map((i) => normals[i]).reduce((acc, n) => acc.map((v, k) => v + n[k]), [0, 0, 0]);
  const dl = Math.hypot(...d);
  const dir = d.map((v) => v / dl);
  const upRaw = normals[corner[0]];
  const along = upRaw.reduce((acc, v, k) => acc + v * dir[k], 0);
  const upV = upRaw.map((v, k) => v - along * dir[k]);
  const ul = Math.hypot(...upV);
  const up = upV.map((v) => v / ul);
  // right = forward × up, forward = -dir
  const f = dir.map((v) => -v);
  const right = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
  const project = (p: number[]) => [p.reduce((acc, v, k) => acc + v * right[k], 0), -p.reduce((acc, v, k) => acc + v * up[k], 0)];
  const shown = corner.map((i) => ({ i, pts: a.fold.points[i].map((p) => project(s(p))) }));
  const all = shown.flatMap((x) => x.pts);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const scale = (size - 16) / Math.max(maxX - minX, maxY - minY);
  const at = (p: number[]) => [(p[0] - minX) * scale + 8, (p[1] - minY) * scale + 8];
  const where = shown.map(({ i, pts }) => ({ i, pts: pts.map(at), c: at(centroid(pts as P2[])) }));
  // the top face first, then the left one of the other two
  const [top, ...sides] = where;
  sides.sort((p, q) => p.c[0] - q.c[0]);
  const name = (i: number) => t.labelName(faces[i].label ?? "", kind, t);
  return (
    <figure className="m-0 flex flex-col items-center gap-1" data-testid="shown-solid">
      <svg width={(maxX - minX) * scale + 16} height={(maxY - minY) * scale + 16} role="img" aria-label={t.shownSolidLabel(name(top.i), name(sides[0].i), name(sides[1].i))}>
        <Patterns uid={uid} />
        {where.map(({ i, pts, c }) => {
          const text = faces[i].label ?? "";
          const isColor = kind === "colors" && COLORS.includes(text as (typeof COLORS)[number]);
          const shade = i === top.i ? 1 : i === sides[0].i ? 0.86 : 0.74;
          return (
            <g key={i}>
              <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={isColor ? `url(#${uid}-p-${text})` : `rgb(${Math.round(255 * shade)},${Math.round(253 * shade)},${Math.round(247 * shade)})`} stroke="#334155" stroke-width="1.5" stroke-linejoin="round" />
              {isColor && <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={`rgba(15,23,42,${(1 - shade) * 1.2})`} />}
              <SolidLabel text={text} kind={kind} c={c} size={scale * 0.9} t={t} />
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-slate-500">{t.shownSolid}</figcaption>
    </figure>
  );
};

const SolidLabel = ({ text, kind, c, size, t }: { text: string; kind: LabelKind; c: number[]; size: number; t: Texts }) => {
  if (!text) return null;
  if (kind === "dots" && PIPS[text])
    return <g>{PIPS[text].map((k) => <circle key={k} cx={c[0] + ((k % 3) - 1) * size * 0.2} cy={c[1] + (Math.floor(k / 3) - 1) * size * 0.16} r={size * 0.065} fill="#1e293b" />)}</g>;
  if (kind === "colors")
    return (
      <g>
        <rect x={c[0] - size * 0.4} y={c[1] - size * 0.12} width={size * 0.8} height={size * 0.24} rx="3" fill="rgba(255,255,255,.92)" />
        <text x={c[0]} y={c[1] + 0.5} text-anchor="middle" dominant-baseline="middle" font-size={Math.max(8, size * 0.16)} font-weight="600" fill="#1e293b">{t.color[text] ?? text}</text>
      </g>
    );
  return <text x={c[0]} y={c[1] + 1} text-anchor="middle" dominant-baseline="middle" font-size={size * 0.42} font-weight="700" fill="#1e293b">{text}</text>;
};
