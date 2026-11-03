import { useState } from "preact/hooks";
import { Setup, TreeEntry, parseEntry, treeSlots } from "./chance";
import type { Texts } from "./texts";
import { stepName } from "./view";

// Tree mode: a two-step probability tree as lines (SVG) with fields on it. Per branch the probability (and, when the
// candidate chooses them, the outcome at its end); per path the probability of the path; then the event.

const ROW = 64, HEAD = 30, W = 720;
const X = { root: 14, node1: 210, node1End: 314, node2: 480, node2End: 584, path: 610 };
const BOX = 104;

const field = "h-8 rounded-md border bg-white px-1.5 text-center text-sm tabular-nums text-slate-900 shadow-sm focus-visible:outline-2 " +
  "focus-visible:outline-offset-1 focus-visible:outline-sky-700 disabled:bg-slate-50 disabled:text-slate-700";

/** Refuses what cannot be part of a probability (digits, / , . % and spaces only). */
const guard = (e: InputEvent) => {
  if (e.data && !/^[\d/.,%\s]*$/.test(e.data)) e.preventDefault();
};

export const TreeView = ({ setup, entry, latest, t, readOnly, onChange }: {
  setup: Setup; entry: TreeEntry; latest: () => TreeEntry; t: Texts; readOnly: boolean; onChange: (e: TreeEntry) => void;
}) => {
  const { first, second, outcomes } = treeSlots(setup, entry);
  const name = stepName(t);
  const choose = setup.tree.labels === "choose";
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const leaves = second.flat().length;
  const height = HEAD + leaves * ROW + 10;
  // the y of every leaf, and of every first-stage node in the middle of its leaves
  let k = 0;
  const leafY = second.map((row) => row.map(() => HEAD + ROW * (k++ + 0.5)));
  const nodeY = leafY.map((ys, i) => (ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : HEAD + ROW * (i + 0.5)));
  const rootY = nodeY.length ? (nodeY[0] + nodeY[nodeY.length - 1]) / 2 : height / 2;

  // from the store, not this render: two changes before a repaint must not undo each other
  const set = (part: "labels" | "probs" | "paths", id: string, value: string) => {
    const now = latest();
    onChange({ ...now, [part]: { ...now[part], [id]: value } });
  };
  const invalid = (value: string | undefined, id: string) => !!touched[id] && !!String(value ?? "").trim() && !parseEntry(value!);
  const prob = (id: string, label: string, x: number, y: number, part: "probs" | "paths" = "probs") => {
    const value = entry[part][id] ?? "";
    const bad = invalid(value, `${part}:${id}`);
    return (
      <input key={`${part}-${id}`} type="text" inputMode="decimal" autoComplete="off" spellcheck={false} value={value} disabled={readOnly}
        aria-label={label} aria-invalid={bad ? "true" : undefined} data-testid={`${part === "probs" ? "p" : "path"}-${id}`}
        className={`${field} absolute w-[76px] ${bad ? "border-rose-600 ring-1 ring-rose-600" : "border-slate-400"}`}
        style={{ left: `${x - 38}px`, top: `${y - 16}px` }}
        onBeforeInput={guard as any} onBlur={() => setTouched((t) => ({ ...t, [`${part}:${id}`]: true }))}
        onInput={(e) => set(part, id, (e.target as HTMLInputElement).value)} />
    );
  };
  const node = (id: string, label: string, x: number, y: number, aria: string, options: string[]) =>
    choose ? (
      <select key={`l-${id}`} value={label} disabled={readOnly} aria-label={aria} data-testid={`l-${id}`}
        className={`${field} absolute border-slate-400 text-left`} style={{ left: `${x}px`, top: `${y - 16}px`, width: `${BOX}px` }}
        onChange={(e) => set("labels", id, (e.target as HTMLSelectElement).value)}>
        <option value="">{t.choose}</option>
        {options.map((o) => <option key={o} value={o}>{name(o)}</option>)}
      </select>
    ) : (
      <span key={`l-${id}`} className="absolute flex h-8 items-center justify-center truncate rounded-full border border-slate-300 bg-slate-50 px-2 text-sm font-medium text-slate-800"
        style={{ left: `${x}px`, top: `${y - 16}px`, width: `${BOX}px` }} data-testid={`l-${id}`}>{name(label)}</span>
    );

  const anyInvalid = Object.keys(touched).some((key) => {
    const [part, id] = key.split(":") as ["probs" | "paths", string];
    return invalid(entry[part]?.[id], key);
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={t.tree} data-testid="tree">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">{t.tree}</h3>
      <p className="mb-2 text-xs text-slate-500" id="cp-tree-help">{t.treeHelp}</p>
      <div className="overflow-x-auto">
        <div className="relative" style={{ width: `${W}px`, height: `${height}px` }}>
          <svg width={W} height={height} aria-hidden="true" className="absolute inset-0">
            <circle cx={X.root} cy={rootY} r="6" fill="#0f172a" />
            {first.map((_, i) => (
              <g key={i}>
                <line x1={X.root} y1={rootY} x2={X.node1} y2={nodeY[i]} stroke="#64748b" stroke-width="2" />
                {second[i].map((_, j) => (
                  <line key={j} x1={X.node1End} y1={nodeY[i]} x2={X.node2} y2={leafY[i][j]} stroke="#64748b" stroke-width="2" />
                ))}
              </g>
            ))}
          </svg>
          <span className="absolute text-xs font-semibold text-slate-500" style={{ left: `${X.node1}px`, top: "2px" }}>{t.first}</span>
          <span className="absolute text-xs font-semibold text-slate-500" style={{ left: `${X.node2}px`, top: "2px" }}>{t.second}</span>
          {setup.tree.paths && <span className="absolute text-xs font-semibold text-slate-500" style={{ left: `${X.path - 4}px`, top: "2px" }}>{t.pathProbability}</span>}
          {first.map((slot, i) => {
            const midY = (rootY + nodeY[i]) / 2;
            return [
              prob(slot.id, t.branchProb(name(slot.label)), (X.root + X.node1) / 2, midY),
              node(slot.id, slot.label, X.node1, nodeY[i], t.branchLabel(i + 1), outcomes),
              ...second[i].flatMap((s2, j) => {
                const path = [slot.label, s2.label].map((l) => name(l) || "?").join(", ");
                const out = [
                  // 70% along the branch: the fields of sibling branches lie far enough apart there
                  prob(s2.id, t.branchProbAfter(name(s2.label), name(slot.label)), X.node1End + 0.7 * (X.node2 - X.node1End), nodeY[i] + 0.7 * (leafY[i][j] - nodeY[i])),
                  node(s2.id, s2.label, X.node2, leafY[i][j], t.branchLabelAfter(name(slot.label), j + 1), outcomes),
                ];
                if (setup.tree.paths) out.push(prob(s2.id, t.pathProb(path), X.path + 38, leafY[i][j], "paths"));
                return out;
              }),
            ];
          })}
        </div>
      </div>
      {setup.tree.event && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-800">
          <span>{t.answer(setup.tree.event.text)} =</span>
          <input type="text" inputMode="decimal" autoComplete="off" spellcheck={false} value={entry.answer} disabled={readOnly} data-testid="answer" aria-label={t.answer(setup.tree.event.text)}
            className={`${field} w-24 border-slate-400`} onBeforeInput={guard as any}
            onInput={(e) => onChange({ ...latest(), answer: (e.target as HTMLInputElement).value })} />
        </label>
      )}
      {anyInvalid && <p className="mt-2 text-sm text-rose-700" role="alert">{t.notANumber}</p>}
    </section>
  );
};
