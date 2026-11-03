// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/textgapmatch, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useRef, useState } from "preact/hooks";
import { Zone, nextZoneId } from "./model";
import { Texts } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance), as the original's editor: the author chooses the image
// (data-backdrop) and draws the drop zones on it (data-dropzones). A drag on the image draws a zone, as in the
// original; double-clicking a zone removes it. New: zones can be selected, moved and resized with the keyboard, and
// edited as numbers.

/** An uploaded bitmap is stored at most this wide or high; an SVG up to MAX_SVG is kept as it is. */
const MAX_SIDE = 1280;
const MAX_SVG = 200 * 1024;
const MAX_STORED = 1024 * 1024;
/** The original ignored zones smaller than 2% of the image. */
const MIN_SIZE = 2;

const readAs = (file: File, as: "dataUrl" | "text") =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    as === "dataUrl" ? reader.readAsDataURL(file) : reader.readAsText(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("not an image"));
    img.src = src;
  });

const kb = (dataUrl: string) => Math.ceil(dataUrl.length / 1024);

/** The image as a data: URL, so the item needs no separate file. */
async function storeImage(file: File, t: Texts): Promise<string> {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!isSvg && !file.type.startsWith("image/")) throw new Error(t.notAnImage);
  const original = await readAs(file, "dataUrl");
  const img = await loadImage(original).catch(() => {
    throw new Error(t.notAnImage);
  });
  if (isSvg && file.size <= MAX_SVG) {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(await readAs(file, "text"))))}`;
  }
  const width = img.naturalWidth || MAX_SIDE;
  const height = img.naturalHeight || MAX_SIDE;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const candidates = [canvas.toDataURL("image/png"), canvas.toDataURL("image/webp", 0.9)].filter((s) =>
    /^data:image\/(png|webp)/.test(s)
  );
  const src = candidates.sort((a, b) => a.length - b.length)[0];
  if (src.length > MAX_STORED) throw new Error(t.tooBig(kb(src)));
  return src;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n * 100) / 100;

/** What keeps the configuration from being used (getAuthoringInstance validate()). */
export const authoringProblems = (zones: Zone[], t: Texts) => {
  const problems: string[] = [];
  if (!zones.length) problems.push(t.noZones);
  if (zones.some((z) => !z.id.trim())) problems.push(t.emptyId);
  const ids = zones.map((z) => z.id);
  ids.filter((id, i) => id && ids.indexOf(id) !== i).forEach((id) => problems.push(t.duplicateId(id)));
  return problems;
};

const button = "rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40";

const Authoring = ({ initialImage, exampleImage, initialZones, markupImage, t, onChange }: {
  initialImage: string;
  exampleImage: string;
  initialZones: Zone[];
  /** the item has an <img> in its markup: that one is shown in delivery */
  markupImage: boolean;
  t: Texts;
  onChange: (image: string, zones: Zone[]) => void;
}) => {
  const [image, setImage] = useState(initialImage);
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Zone | null>(null);
  const [error, setError] = useState("");
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const commit = (nextImage: string, nextZones: Zone[]) => {
    setImage(nextImage);
    setZones(nextZones);
    onChange(nextImage, nextZones);
  };
  const setZone = (i: number, change: Partial<Zone>) =>
    commit(image, zones.map((z, j) => (j === i ? { ...z, ...change } : z)));
  const removeZone = (i: number) => {
    commit(image, zones.filter((_, j) => j !== i));
    setSelected(null);
  };

  /** A point on the image, in percentages. */
  const at = (e: PointerEvent) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) };
  };
  const rect = (a: { x: number; y: number }, b: { x: number; y: number }, id: string): Zone => ({
    id,
    x: round(Math.min(a.x, b.x)),
    y: round(Math.min(a.y, b.y)),
    w: round(Math.abs(b.x - a.x)),
    h: round(Math.abs(b.y - a.y)),
  });

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-zone]")) return;
    e.preventDefault();
    start.current = { ...at(e), id: e.pointerId };
    canvas.current.setPointerCapture?.(e.pointerId);
    setDraft(rect(start.current, start.current, ""));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (start.current?.id !== e.pointerId) return;
    setDraft(rect(start.current, at(e), ""));
  };
  const onPointerUp = (e: PointerEvent) => {
    if (start.current?.id !== e.pointerId) return;
    const zone = rect(start.current, at(e), nextZoneId(zones));
    start.current = null;
    setDraft(null);
    if (zone.w < MIN_SIZE || zone.h < MIN_SIZE) {
      setSelected(null);
      return;
    }
    commit(image, [...zones, zone]);
    setSelected(zones.length);
  };

  const onZoneKey = (i: number) => (e: KeyboardEvent) => {
    const z = zones[i];
    const step = e.altKey ? 0.1 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeZone(i);
      canvas.current?.focus();
    } else if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      if (e.shiftKey) setZone(i, { w: round(clamp(z.w + dx, MIN_SIZE, 100 - z.x)), h: round(clamp(z.h + dy, MIN_SIZE, 100 - z.y)) });
      else setZone(i, { x: round(clamp(z.x + dx, 0, 100 - z.w)), y: round(clamp(z.y + dy, 0, 100 - z.h)) });
    }
  };

  const addZone = () => {
    commit(image, [...zones, { id: nextZoneId(zones), x: 40, y: 45, w: 20, h: 10 }]);
    setSelected(zones.length);
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      commit(await storeImage(file, t), zones);
    } catch (err) {
      setError((err as Error).message || t.notAnImage);
    }
  };

  const problems = authoringProblems(zones, t);
  const number = (i: number, key: "x" | "y" | "w" | "h") => (
    <label className="flex flex-col gap-0.5 text-xs text-slate-500">
      {t.zoneFields[key]}
      <input type="number" step="0.1" min="0" max="100" value={zones[i][key]} data-testid={`zone-${i}-${key}`}
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
        onChange={(e) => {
          const n = parseFloat((e.target as HTMLInputElement).value);
          if (Number.isFinite(n)) setZone(i, { [key]: round(clamp(n, 0, 100)) });
        }} />
    </label>
  );

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className={button} onClick={() => fileInput.current?.click()} data-testid="upload">{t.uploadImage}</button>
        <input ref={fileInput} type="file" accept="image/*" className="hidden"
          onChange={(e) => upload((e.target as HTMLInputElement).files?.[0])} />
        <label className="flex min-w-48 flex-1 flex-col gap-0.5 text-xs text-slate-500">
          {t.imageUrl}
          <input type="url" value={image.startsWith("data:") ? "" : image} placeholder={image.startsWith("data:") ? "data:…" : "https://…"}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
            onChange={(e) => commit((e.target as HTMLInputElement).value.trim(), zones)} />
        </label>
        <button type="button" className={button} onClick={() => commit("", zones)} disabled={!image}>{t.exampleButton}</button>
      </div>
      {markupImage && <p className="m-0 text-xs text-amber-700">{t.markupImageUsed}</p>}
      {error && <p className="m-0 text-xs text-red-600" role="alert">{error}</p>}
      <p className="m-0 text-xs text-slate-500">{t.drawHint}</p>

      <div ref={canvas} tabIndex={-1} data-testid="canvas"
        className="relative inline-block max-w-full cursor-crosshair touch-none select-none self-start rounded-lg border border-slate-200 outline-none"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { start.current = null; setDraft(null); }}>
        <img src={image || exampleImage} alt="" draggable={false} className="block h-auto max-w-full rounded-lg" />
        {zones.map((z, i) => (
          <button type="button" key={i} data-zone={z.id} data-testid={`zone-${i}`} aria-pressed={selected === i}
            aria-label={`${z.id}: ${z.x}%, ${z.y}%, ${z.w}% × ${z.h}%`}
            className={`absolute cursor-pointer rounded-md border-2 text-left text-[11px] font-semibold leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
              selected === i ? "border-sky-700 bg-sky-500/30 text-sky-950" : "border-sky-600 bg-sky-500/15 text-sky-900"
            }`}
            style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
            onClick={() => setSelected(i)} onDblClick={() => removeZone(i)} onKeyDown={onZoneKey(i)}>
            <span className="absolute left-1 top-1 rounded bg-white/80 px-1 py-0.5">{z.id}</span>
          </button>
        ))}
        {draft && (
          <div className="pointer-events-none absolute border-2 border-dashed border-sky-700 bg-sky-500/10"
            style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%` }} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={addZone} data-testid="add-zone">{t.addZone}</button>
        <span className="text-slate-600" data-testid="summary">{t.zones(zones.length)}</span>
        {problems.map((p) => <span key={p} className="text-red-600">{p}</span>)}
      </div>

      {selected !== null && zones[selected] && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" data-testid="zone-editor">
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            {t.zoneId}
            <input type="text" value={zones[selected].id} data-testid="zone-id"
              className="w-36 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
              onInput={(e) => setZone(selected, { id: (e.target as HTMLInputElement).value.trim() })} />
          </label>
          {number(selected, "x")}
          {number(selected, "y")}
          {number(selected, "w")}
          {number(selected, "h")}
          <button type="button" className={`${button} text-red-700`} onClick={() => removeZone(selected)}>
            {t.removeZone(zones[selected].id)}
          </button>
        </div>
      )}
      <p className="m-0 text-xs text-slate-500">{t.idHint}</p>
    </div>
  );
};

export default Authoring;
