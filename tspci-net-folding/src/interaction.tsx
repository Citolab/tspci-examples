import { IStore, useStore } from "@citolab/preact-store";
import { useMemo, useState } from "preact/hooks";
import {
  Face, Puzzle, Tile, analyze, applyTile, faceAt, faceId, faceIndex, labelsWith, mainNet, netId, paletteFor, sameShapes, shownCorner, solidBox,
  tilesFor, turnAt,
} from "./net";
import { FaceRole, Look, NetGrid, NetPicture, ShownSolid, faceName } from "./netsvg";
import { FoldView } from "./foldview";
import type { FaceLook } from "./scene3d";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the question, the net (a grid to build on, a net to choose faces in or fill in, or several
// nets to choose from) and the 3D view that folds it.

const button = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";
const toggle = (pressed: boolean) =>
  `${button} ${pressed ? "border-sky-700 bg-sky-50 text-sky-900 ring-2 ring-sky-700" : ""}`;

let uidCounter = 0;
export const useUid = () => useMemo(() => `nf${++uidCounter}`, []);

/** What the folded net is like, in words. */
export const verdict = (t: Texts, p: Puzzle, faces: Face[]) => {
  if (!faces.length) return t.verdictNoNet;
  const a = analyze(faces, p.solid);
  if (!a.connected) return t.verdictParts;
  if (a.overlaps) return t.verdictOverlap;
  if (a.gaps) return t.verdictGaps(a.gaps);
  if (!sameShapes(faces, p.solid, solidBox(p))) return t.verdictWrongFaces(t.solid[p.solid]);
  return t.verdictClosed(t.solid[p.solid]);
};

const tileName = (t: Texts, tile: Tile, turned: boolean) =>
  tile === "tri" ? t.tileTriangle : tile.w === 1 && tile.h === 1 ? t.tileSquare : turned ? t.tileRect(tile.h, tile.w) : t.tileRect(tile.w, tile.h);

const Interaction = ({ puzzle, store, t, language, prompt, showFold, showResult, readOnly }: {
  puzzle: Puzzle; store: IStore<StateModel, Actions>; t: Texts; language: string; prompt: string; showFold: boolean; showResult: boolean; readOnly: boolean;
}) => {
  const state = useStore(store);
  const [message, setMessage] = useState("");
  const uid = useUid();
  const p = puzzle;
  const net = mainNet(p);
  const kind = p.labels;

  // --- build mode
  const tiles = tilesFor(p.solid, solidBox(p));
  const [tool, setTool] = useState(0);
  const [turned, setTurned] = useState(false);
  const [picked, setPicked] = useState(-1);
  const tile = tiles[Math.min(tool, tiles.length - 1)];
  const setFaces = (faces: Face[]) => store.dispatch({ type: "SET_FACES", payload: { faces } });
  const describeFace = (f: Face) => (f.base ? t.triangle(t.sideName[f.base]) : (f.w ?? 1) === 1 && (f.h ?? 1) === 1 ? t.square : t.rectangle(f.w ?? 1, f.h ?? 1));
  const edit = (x: number, y: number, hint?: Parameters<typeof applyTile>[7]) => {
    const e = applyTile(state.faces, tile, turned, x, y, p.columns, p.rows, hint);
    if (e.result === "placed") setMessage(t.placed(describeFace(e.face!), y + 1, x + 1));
    else if (e.result === "removed") setMessage(t.removed(describeFace(e.face!)));
    else if (e.result === "doesNotFit") setMessage(t.doesNotFit);
    else if (e.result === "needsNeighbour") setMessage(t.needsNeighbour);
    if (e.faces !== state.faces) { setFaces(e.faces); setPicked(-1); }
  };
  const turn = (x: number, y: number) => {
    if (faceAt(state.faces, x, y) >= 0) {
      const e = turnAt(state.faces, x, y, p.columns, p.rows);
      if (e.result === "turned") { setFaces(e.faces); setMessage(t.turned(describeFace(e.face!))); }
      else if (e.result === "doesNotFit") setMessage(t.doesNotFit);
    } else if (tile !== "tri" && tile.w !== tile.h) {
      setTurned(!turned);
      setMessage(t.turned(tileName(t, tile, !turned)));
    }
  };
  const remove = (x: number, y: number) => {
    const i = faceAt(state.faces, x, y);
    if (i < 0) return;
    setMessage(t.removed(describeFace(state.faces[i])));
    setFaces(state.faces.filter((_, k) => k !== i));
  };

  // --- choosing faces (opposite, adjacent) and labelling them (complete)
  const ask = faceIndex(p.ask);
  const name = (i: number, label?: string) => faceName(t, net, i, kind, label);
  const choose = (i: number) => {
    if (readOnly || i === ask) return;
    const id = faceId(i);
    if (p.mode === "opposite") {
      const chosen = state.chosen.includes(id) ? [] : [id];
      store.dispatch({ type: "SET_CHOSEN", payload: { chosen } });
      setMessage(chosen.length ? t.chosenFace(name(i)) : t.unchosenFace(name(i)));
    } else {
      const on = !state.chosen.includes(id);
      const chosen = on ? [...state.chosen, id] : state.chosen.filter((c) => c !== id);
      store.dispatch({ type: "SET_CHOSEN", payload: { chosen } });
      setMessage(on ? t.chosenFace(name(i)) : t.unchosenFace(name(i)));
    }
  };
  const palette = paletteFor(p);
  const [label, setLabel] = useState<string | null>(null);
  const fill = (i: number, value: string | null) => {
    if (readOnly) return;
    const id = faceId(i);
    if (!p.blanks.includes(id)) return setMessage(t.notBlank);
    const labels = { ...state.labels };
    if (value === null) {
      if (!labels[id]) return setMessage(t.pickLabelFirst);
      delete labels[id];
      setMessage(t.unlabelled(t.blankFace(i + 1)));
    } else {
      labels[id] = value;
      setMessage(t.labelled(t.blankFace(i + 1), t.labelName(value, kind, t)));
    }
    store.dispatch({ type: "SET_LABELS", payload: { labels } });
  };
  const candidateLabels = labelsWith(p, state.labels);

  // --- what each face looks like, in the net and in 3D
  const looks: Look[] = net.map((_, i) => {
    const id = faceId(i);
    if (p.mode === "opposite" || p.mode === "adjacent") return i === ask ? "asked" : state.chosen.includes(id) ? "chosen" : "plain";
    if (p.mode === "complete") return p.blanks.includes(id) ? "blank" : "plain";
    return "plain";
  });
  const sceneLooks = (faces: Face[], labels: string[], netLooks: Look[]): FaceLook[] =>
    faces.map((f, i) => ({ label: labels[i] ?? f.label ?? "", kind, state: netLooks[i] === "correct" ? "plain" : (netLooks[i] ?? "plain") as FaceLook["state"], name: t.color[labels[i] ?? f.label ?? ""] }));

  // --- the folds mode: which net is in 3D
  const [shown, setShown] = useState(0);

  const question = prompt || (
    p.mode === "build" ? t.questionBuild(t.solid[p.solid])
      : p.mode === "opposite" ? t.questionOpposite(ask >= 0 ? t.labelName(net[ask].label ?? String(ask + 1), kind, t) : "")
      : p.mode === "adjacent" ? t.questionAdjacent(ask >= 0 ? t.labelName(net[ask].label ?? String(ask + 1), kind, t) : "")
      : p.mode === "complete" ? t.questionComplete
      : t.questionFolds(t.solid[p.solid]));

  // --- the net and the 3D view per mode
  let left: preact.ComponentChildren = null;
  let fold: { faces: Face[]; looks: FaceLook[]; onPick?: (i: number) => void } | null = null;

  if (p.mode === "build") {
    const a = analyze(state.faces, p.solid);
    const gridLooks: Look[] = state.faces.map((_, i) => (i === picked ? "chosen" : showResult && a.overlapping.includes(i) ? "overlap" : "plain"));
    left = (
      <div className="flex flex-col gap-3">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.tiles}>
            {tiles.length > 1 && tiles.map((k, i) => (
              <button key={i} type="button" className={toggle(i === tool)} aria-pressed={i === tool ? "true" : "false"} onClick={() => { setTool(i); setTurned(false); }}>
                {tileName(t, k, i === tool && turned)}
              </button>
            ))}
            {tile !== "tri" && tile.w !== tile.h && <button type="button" className={button} onClick={() => setTurned(!turned)}>{t.rotate}</button>}
            <button type="button" className={button} onClick={() => { setFaces([]); setMessage(t.cleared); }} disabled={!state.faces.length}>{t.clear}</button>
            <span className="text-sm text-slate-500" data-testid="count">{t.faces(state.faces.length)}</span>
          </div>
        )}
        <NetGrid faces={state.faces} columns={p.columns} rows={p.rows} kind={kind} t={t} uid={uid} label={`${t.grid}: ${question}`} readOnly={readOnly}
          looks={gridLooks} onActivate={edit} onTurn={turn} onRemove={remove} />
      </div>
    );
    fold = { faces: state.faces, looks: sceneLooks(state.faces, [], gridLooks), onPick: (i) => { setPicked(i); setMessage(describeFace(state.faces[i])); } };
  } else if (p.mode === "opposite" || p.mode === "adjacent") {
    const role: FaceRole = p.mode === "opposite" ? "radio" : "checkbox";
    left = (
      <NetPicture faces={net} kind={kind} t={t} uid={uid} label={`${t.net}: ${question}`} looks={looks} readOnly={readOnly}
        roles={net.map((_, i) => (i === ask ? "none" : role))} names={net.map((_, i) => (i === ask ? `${name(i)} (${t.asked})` : name(i)))} onFace={choose} />
    );
    fold = { faces: net, looks: sceneLooks(net, [], looks), onPick: choose };
  } else if (p.mode === "complete") {
    const corner = shownCorner(p);
    left = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-6">
          <NetPicture faces={net} kind={kind} t={t} uid={uid} label={`${t.net}: ${question}`} looks={looks} labels={candidateLabels} readOnly={readOnly}
            roles={net.map((_, i) => (p.blanks.includes(faceId(i)) ? "button" : "none"))}
            names={net.map((_, i) => (p.blanks.includes(faceId(i)) ? (candidateLabels[i] ? name(i, candidateLabels[i]) : t.blankFace(i + 1)) : name(i)))}
            onFace={(i) => (label ? fill(i, label) : fill(i, null))}
            onKey={(i, e) => {
              if (e.key === "Delete" || e.key === "Backspace") { fill(i, null); return true; }
              const hit = palette.find((l) => l.toLowerCase() === e.key.toLowerCase());
              if (hit && kind !== "colors") { fill(i, hit); return true; }
              return false;
            }} />
          {corner && <ShownSolid faces={net} solid={p.solid} corner={corner.corner} kind={kind} t={t} uid={`${uid}s`} />}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.chooseLabel}>
            <span className="text-sm text-slate-600">{t.chooseLabel}:</span>
            {palette.map((l) => (
              <button key={l} type="button" className={toggle(label === l)} aria-pressed={label === l ? "true" : "false"}
                onClick={() => { const next = label === l ? null : l; setLabel(next); if (next) setMessage(t.labelChosen(t.labelName(l, kind, t))); }}>
                {t.labelName(l, kind, t)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
    fold = { faces: net, looks: sceneLooks(net, candidateLabels, looks), onPick: (i) => (label ? fill(i, label) : setMessage(t.pickLabelFirst)) };
  } else {
    left = (
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-0" aria-label={question}>
        {p.nets.map((n, k) => {
          const id = netId(k);
          const on = state.chosen.includes(id);
          return (
            <li key={k} className={`flex flex-col items-center gap-2 rounded-xl border p-3 ${on ? "border-sky-700 bg-sky-50" : "border-slate-200 bg-white"}`} data-net={id}>
              <NetPicture faces={n} kind={kind} t={t} uid={`${uid}n${k}`} label={t.netN(k + 1)} looks={n.map(() => "plain")} roles={n.map(() => "none")}
                names={n.map((_, i) => faceName(t, n, i, kind))} maxSize={150} />
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" className="h-4 w-4 accent-sky-700" checked={on} disabled={readOnly}
                  onChange={() => {
                    const chosen = on ? state.chosen.filter((c) => c !== id) : [...state.chosen, id];
                    store.dispatch({ type: "SET_CHOSEN", payload: { chosen } });
                    setMessage(on ? t.unchosenFace(t.netN(k + 1)) : t.chosenFace(t.netN(k + 1)));
                  }} />
                {t.foldsCheckbox(k + 1, t.solid[p.solid])}
              </label>
              {showFold && (
                <button type="button" className={toggle(shown === k)} aria-pressed={shown === k ? "true" : "false"} onClick={() => setShown(k)}>
                  {t.showIn3d(k + 1)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
    const n = p.nets[shown] ?? [];
    fold = { faces: n, looks: sceneLooks(n, [], n.map(() => "plain")) };
  }

  const verdictText = fold ? verdict(t, p, fold.faces) : "";
  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800" data-mode={p.mode}>
      <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{question}</p>
      <div className={`grid gap-4 ${showFold ? "md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]" : ""}`}>
        <div className="min-w-0">{left}</div>
        {showFold && fold && (
          <FoldView faces={fold.faces} solid={p.solid} looks={fold.looks} t={t} language={language} onPick={readOnly ? undefined : fold.onPick}
            description={(pct) => `${t.foldValue(pct, language)}.${pct === 100 ? ` ${verdictText}` : ""}`} />
        )}
      </div>
      {showResult && fold && <p className="m-0 text-sm font-medium text-slate-700" data-testid="verdict">{verdictText}</p>}
      <p role="status" aria-live="polite" className="m-0 min-h-5 text-sm text-slate-600" data-testid="status">{message}</p>
    </div>
  );
};

export default Interaction;
