import { useState } from "preact/hooks";
import {
  COLORS, EXAMPLES, Face, LABEL_KINDS, LabelKind, MAX_BLANKS, MAX_BOX, MAX_GRID, MAX_NETS, MIN_GRID, MODES, Mode, Puzzle, SOLIDS, Solid, Tile, analyze,
  applyTile, cleanFaces, cornerOf, corners, correctIds, defaultLabels, faceId, faceIndex, foldsInto, mainNet, puzzleProblems, solidBox,
  standardNet, tilesFor, turnAt,
} from "./net";
import { NetGrid, faceName } from "./netsvg";
import { FoldView } from "./foldview";
import { useUid } from "./interaction";
import { Texts, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the question type, the solid and the grid; the net or nets
// with their labels; and what the answer follows from. The result is data-puzzle (net.ts).

/** What keeps the puzzle from being used (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (p: Puzzle, language: string): string[] => {
  const t = textsFor(language);
  return puzzleProblems(p).map((k) => t.problem[k.key](k.n));
};

const button = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";
const pressed = (on: boolean) => `${button} ${on ? "border-sky-700 bg-sky-50 text-sky-900 ring-2 ring-sky-700" : ""}`;
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
type Tab = "task" | "net" | "answer";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const needsLabels = (mode: Mode) => mode === "opposite" || mode === "adjacent" || mode === "complete";
const labelled = (faces: Face[], kind: LabelKind) => {
  const labels = defaultLabels(kind, faces.length);
  return faces.map((f, i) => ({ ...f, label: labels[i] }));
};
/** The standard net in the middle of the grid. */
const centred = (p: Puzzle): Face[] => {
  const net = standardNet(p.solid, solidBox(p));
  const w = Math.max(...net.map((f) => f.x + (f.w ?? 1))), h = Math.max(...net.map((f) => f.y + (f.h ?? 1)));
  const dx = Math.max(0, Math.floor((p.columns - w) / 2)), dy = Math.max(0, Math.floor((p.rows - h) / 2));
  return net.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy }));
};
/** A grid the standard net fits on. */
const roomy = (p: Puzzle): Puzzle => {
  const net = standardNet(p.solid, solidBox(p));
  const w = Math.max(...net.map((f) => f.x + (f.w ?? 1))), h = Math.max(...net.map((f) => f.y + (f.h ?? 1)));
  return { ...p, columns: Math.min(MAX_GRID, Math.max(p.columns, w + 2)), rows: Math.min(MAX_GRID, Math.max(p.rows, h + 2)) };
};

const tileName = (t: Texts, tile: Tile) => (tile === "tri" ? t.tileTriangle : tile.w === 1 && tile.h === 1 ? t.tileSquare : t.tileRect(tile.w, tile.h));

const Authoring = ({ initial, language, onChange }: { initial: Puzzle; language: string; onChange: (p: Puzzle) => void }) => {
  const t = textsFor(language);
  const uid = useUid();
  const [p, setP] = useState<Puzzle>(initial);
  const [tab, setTab] = useState<Tab>("task");
  const [current, setCurrent] = useState(0);
  const [tool, setTool] = useState(0);
  const [turned, setTurned] = useState(false);
  const commit = (next: Puzzle) => {
    setP(next);
    onChange(next);
  };
  const problems = authoringProblems(p, language);
  const box = solidBox(p);
  const tiles = tilesFor(p.solid, box);
  const tile = tiles[Math.min(tool, tiles.length - 1)];
  const netIndex = p.mode === "folds" ? Math.min(current, Math.max(0, p.nets.length - 1)) : 0;
  const faces = p.nets[netIndex] ?? [];
  const kind = p.labels;

  // --- the task
  const setMode = (mode: Mode) => {
    const example = clone(EXAMPLES[mode]);
    setCurrent(0);
    commit({ ...example, columns: Math.max(example.columns, p.columns), rows: Math.max(example.rows, p.rows) });
  };
  const setSolid = (solid: Solid, size = p.box) => {
    const next = roomy({ ...p, solid, box: size, ask: null, blanks: [], view: [] });
    const net = centred(next);
    const nets = p.mode === "folds" ? [net, net.slice(0, -1)] : [needsLabels(p.mode) ? labelled(net, p.labels) : net];
    setCurrent(0);
    commit({ ...next, nets });
  };
  const setKind = (labels: LabelKind) => commit({ ...p, labels, nets: p.nets.map((n) => (needsLabels(p.mode) ? labelled(n, labels) : n)) });
  const setGrid = (columns: number, rows: number) => commit({ ...p, columns, rows, nets: p.nets.map((n) => cleanFaces(n, columns, rows)) });

  // --- the net
  const setNet = (next: Face[]) => {
    const nets = [...p.nets];
    nets[netIndex] = next;
    // ids follow the net: the answer settings start again when the main net changes shape
    const reshaped = netIndex === 0 && JSON.stringify(next.map(({ label: _, ...f }) => f)) !== JSON.stringify(faces.map(({ label: _, ...f }) => f));
    commit(reshaped ? { ...p, nets, ask: null, blanks: [], view: [] } : { ...p, nets });
  };
  const fresh = (f: Face): Face => (needsLabels(p.mode) && !f.label ? { ...f, label: defaultLabels(kind, 1)[0] } : f);
  const edit = (x: number, y: number, hint?: Parameters<typeof applyTile>[7]) => {
    const e = applyTile(faces, tile, turned, x, y, p.columns, p.rows, hint);
    if (e.result === "placed") setNet(e.faces.map((f) => (f === e.face ? fresh(f) : f)));
    else if (e.result === "removed") setNet(e.faces);
  };
  const turn = (x: number, y: number) => {
    const e = turnAt(faces, x, y, p.columns, p.rows);
    if (e.result === "turned") setNet(e.faces);
    else if (tile !== "tri" && tile.w !== tile.h) setTurned(!turned);
  };
  const setLabel = (i: number, label: string) => setNet(faces.map((f, k) => (k === i ? { ...f, label } : f)));

  // --- the answer
  const main = mainNet(p);
  const analysis = analyze(main, p.solid);
  const correct = correctIds(p);
  const allCorners = analysis.closed ? corners(analysis) : [];
  const view = analysis.closed ? cornerOf(analysis, p.view) : null;
  const name = (i: number) => faceName(t, main, i, kind);

  const labelField = (f: Face, i: number) => {
    const id = `${uid}-label-${i}`;
    const options = kind === "dots" ? ["1", "2", "3", "4", "5", "6"] : kind === "colors" ? [...COLORS] : null;
    return (
      <label key={i} htmlFor={id} className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">{t.faceLabel(i + 1)}</span>
        {options ? (
          <select id={id} className={field} value={f.label ?? ""} onChange={(e) => setLabel(i, (e.target as HTMLSelectElement).value)}>
            <option value="">–</option>
            {options.map((o) => <option key={o} value={o}>{t.labelName(o, kind, t)}</option>)}
          </select>
        ) : (
          <input id={id} className={`${field} w-16`} value={f.label ?? ""} maxLength={2}
            onInput={(e) => setLabel(i, (e.target as HTMLInputElement).value.replace(/[^A-Za-z0-9]/g, "").slice(0, 2))} />
        )}
      </label>
    );
  };

  const tabButton = (k: Tab, label: string) => (
    <button key={k} type="button" role="tab" aria-selected={tab === k ? "true" : "false"} onClick={() => setTab(k)}
      className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-sky-700 text-sky-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 p-4 font-sans text-slate-800">
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tabButton("task", t.tabTask)}
        {tabButton("net", p.mode === "folds" ? t.tabNets : t.tabNet)}
        {tabButton("answer", t.tabAnswer)}
      </div>

      {tab === "task" && (
        <div role="tabpanel" className="flex flex-col gap-4">
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-semibold">{t.mode}</legend>
            {MODES.map((m) => (
              <label key={m} className="flex items-start gap-2 text-sm">
                <input type="radio" name={`${uid}-mode`} checked={p.mode === m} onChange={() => setMode(m)} className="mt-1 accent-sky-700" />
                <span><span className="font-medium">{t.modeName[m]}</span> <span className="text-slate-500">{t.modeHelp[m]}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">{t.solidLabel}</span>
              <select className={field} value={p.solid} onChange={(e) => setSolid((e.target as HTMLSelectElement).value as Solid)}>
                {SOLIDS.map((s) => <option key={s} value={s}>{t.solidTitle[s]}</option>)}
              </select>
            </label>
            {p.solid === "box" && (
              <fieldset className="m-0 flex items-end gap-1 border-0 p-0">
                <legend className="mb-1 text-sm font-semibold">{t.boxSize}</legend>
                {[0, 1, 2].map((k) => (
                  <input key={k} type="number" min={1} max={MAX_BOX} value={p.box[k]} className={`${field} w-14`} aria-label={`${t.boxSize} ${k + 1}`}
                    onChange={(e) => {
                      const v = Math.min(MAX_BOX, Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1)));
                      const size = [...p.box] as [number, number, number];
                      size[k] = v;
                      setSolid("box", size);
                    }} />
                ))}
              </fieldset>
            )}
            {p.mode !== "build" && p.mode !== "folds" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">{t.labelKind}</span>
                <select className={field} value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value as LabelKind)}>
                  {LABEL_KINDS.map((k) => <option key={k} value={k}>{t.labelKindName[k]}</option>)}
                </select>
              </label>
            )}
            {(["columns", "rows"] as const).map((side) => (
              <label key={side} className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">{t[side]}</span>
                <input type="number" min={MIN_GRID} max={MAX_GRID} value={p[side]} className={`${field} w-16`} data-testid={side}
                  onChange={(e) => {
                    const n = Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(Number((e.target as HTMLInputElement).value))));
                    if (Number.isFinite(n)) setGrid(side === "columns" ? n : p.columns, side === "rows" ? n : p.rows);
                  }} />
              </label>
            ))}
          </div>
        </div>
      )}

      {tab === "net" && (
        <div role="tabpanel" className="flex flex-col gap-3">
          {p.mode === "folds" && (
            <div className="flex flex-wrap items-center gap-2">
              {p.nets.map((n, i) => (
                <button key={i} type="button" className={pressed(i === netIndex)} aria-pressed={i === netIndex ? "true" : "false"} onClick={() => setCurrent(i)}>
                  {t.netN(i + 1)} · {foldsInto(n, p.solid, box) ? t.folds : t.doesNotFold}
                </button>
              ))}
              <button type="button" className={button} disabled={p.nets.length >= MAX_NETS}
                onClick={() => { commit({ ...p, nets: [...p.nets, []] }); setCurrent(p.nets.length); }}>{t.addNet}</button>
              <button type="button" className={button} disabled={p.nets.length <= 1}
                onClick={() => { commit({ ...p, nets: p.nets.filter((_, i) => i !== netIndex) }); setCurrent(Math.max(0, netIndex - 1)); }}>{t.removeNet}</button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.tiles}>
            {tiles.map((k, i) => (
              <button key={i} type="button" className={pressed(i === tool)} aria-pressed={i === tool ? "true" : "false"} onClick={() => { setTool(i); setTurned(false); }}>{tileName(t, k)}</button>
            ))}
            {tile !== "tri" && tile.w !== tile.h && <button type="button" className={pressed(turned)} aria-pressed={turned ? "true" : "false"} onClick={() => setTurned(!turned)}>{t.rotate}</button>}
            <button type="button" className={button} onClick={() => setNet(needsLabels(p.mode) ? labelled(centred(p), kind) : centred(p))}>{t.standard}</button>
            <button type="button" className={button} onClick={() => setNet([])}>{t.clearNet}</button>
            {needsLabels(p.mode) && <button type="button" className={button} onClick={() => setNet(labelled(faces, kind))}>{t.autoLabel}</button>}
          </div>
          <div className="flex flex-wrap items-start gap-6">
            <NetGrid faces={faces} columns={p.columns} rows={p.rows} kind={kind} t={t} uid={uid} label={p.mode === "folds" ? t.netN(netIndex + 1) : t.grid}
              onActivate={edit} onTurn={turn} onRemove={(x, y) => setNet(applyTile(faces, tile, turned, x, y, p.columns, p.rows).faces)} />
            {needsLabels(p.mode) && faces.length > 0 && <div className="flex flex-col gap-1.5" data-testid="labels">{faces.map(labelField)}</div>}
            <div className="w-[300px] max-w-full">
              <FoldView faces={faces} solid={p.solid} looks={faces.map((f) => ({ label: f.label ?? "", kind, state: "plain", name: t.color[f.label ?? ""] }))}
                t={t} language={language} height={240} description={(pct) => t.foldValue(pct, language)} />
            </div>
          </div>
        </div>
      )}

      {tab === "answer" && (
        <div role="tabpanel" className="flex flex-col gap-3 text-sm">
          {p.mode === "build" && <p className="m-0">{t.exampleSolution} {main.length ? (foldsInto(main, p.solid, box) ? t.folds : t.doesNotFold) : ""}</p>}
          {(p.mode === "opposite" || p.mode === "adjacent") && (
            <label className="flex items-center gap-2">
              <span className="font-semibold">{t.askFace}</span>
              <select className={field} value={p.ask ?? ""} data-testid="ask" onChange={(e) => commit({ ...p, ask: (e.target as HTMLSelectElement).value || null })}>
                <option value="">–</option>
                {main.map((_, i) => <option key={i} value={faceId(i)}>{name(i)}</option>)}
              </select>
            </label>
          )}
          {p.mode === "complete" && (
            <>
              <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
                <legend className="mb-1 font-semibold">{t.blanks}</legend>
                {main.map((_, i) => {
                  const id = faceId(i);
                  const on = p.blanks.includes(id);
                  return (
                    <label key={i} className="flex items-center gap-1.5">
                      <input type="checkbox" className="accent-sky-700" checked={on} disabled={!on && p.blanks.length >= MAX_BLANKS}
                        onChange={() => commit({ ...p, blanks: on ? p.blanks.filter((b) => b !== id) : [...p.blanks, id].sort((a, b) => faceIndex(a) - faceIndex(b)) })} />
                      {name(i)}
                    </label>
                  );
                })}
              </fieldset>
              <label className="flex items-center gap-2">
                <span className="font-semibold">{t.view}</span>
                {allCorners.length ? (
                  <select className={field} value={view ? view.map(faceId).join(" ") : ""} data-testid="view"
                    onChange={(e) => commit({ ...p, view: (e.target as HTMLSelectElement).value.split(" ").filter(Boolean) })}>
                    <option value="">–</option>
                    {allCorners.map((c) => <option key={c.join()} value={c.map(faceId).join(" ")}>{c.map((i) => name(i)).join(" · ")}</option>)}
                  </select>
                ) : <span className="text-slate-500">{t.noCorners}</span>}
              </label>
              
            </>
          )}
          {p.mode === "folds" && (
            <ul className="m-0 pl-5">
              {p.nets.map((n, i) => <li key={i}>{t.netN(i + 1)}: {foldsInto(n, p.solid, box) ? t.folds : t.doesNotFold}</li>)}
            </ul>
          )}
          {p.mode !== "build" && (
            <p className="m-0" data-testid="correct">
              <span className="font-semibold">{t.correctAnswer}</span> ({t.computed}) <span className="font-mono">{correct ? correct.join(" ") : "–"}</span>
            </p>
          )}
        </div>
      )}

      <div data-testid="summary" className={`rounded-lg px-3 py-2 text-sm ${problems.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`} role="status">
        {problems.length ? <ul className="m-0 pl-5">{problems.map((m) => <li key={m}>{m}</li>)}</ul> : t.ok}
      </div>
    </div>
  );
};

export default Authoring;
