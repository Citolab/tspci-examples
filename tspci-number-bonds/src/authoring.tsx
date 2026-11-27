/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author picks the house or the tree and fills in the
 * numbers the pupil gets, in the drawing the pupil will see. A box left empty is one the pupil fills in. The house gets
 * rows (or, for all splits, a row for every split of the roof); every part of the tree can split again, in two or three
 * legs. Below the drawing: whether the layout has one answer (then match_correct can score it) and what is wrong with it.
 * It writes the settings model, task, house, tree, countZero, orderMatters and decimals.
 */
import type { ComponentChildren } from "preact";
import type { PciProperties } from "@citolab/tspci";
import { useState } from "preact/hooks";
import configProps from "./config.json";
import {
  DEFAULT_HOUSE, DEFAULT_TREE, MAX_DEPTH, MAX_LEGS, MAX_ROWS, Model, ModelKind, Task, TreeNode, formatNumber, layoutProblems,
  modelFrom, modelKind, numberPattern, parseHouse, parseNumber, parseTree, splitCount, uniqueSolution,
} from "./bonds";
import { Drawing, boxLabel } from "./drawings";
import { Language, TEXTS } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

/** A box of the tree as the author types it: "" is the pupil's. */
export type EditNode = { value: string; parts: EditNode[] };

/** What the author makes: the texts of the boxes as typed, "" for a box the pupil fills in. */
export type Authored = {
  model: ModelKind;
  task: Task;
  roof: string;
  rows: [string, string][];
  tree: EditNode;
  countZero: boolean;
  orderMatters: boolean;
  decimals: boolean;
};

const text = (value: number | null) => (value === null ? "" : formatNumber(value));
const editNode = (node: TreeNode): EditNode => ({ value: text(node.value), parts: node.parts.map(editNode) });
const box = (typed: string) => typed.trim() || "?";

/** The authoring mode starts from the settings; a layout that cannot be read starts from the default one. */
export function authoredFrom(properties: Partial<PropTypes>): Authored {
  const house = parseHouse(properties.house ?? "") ?? parseHouse(DEFAULT_HOUSE)!;
  const tree = parseTree(properties.tree ?? "") ?? parseTree(DEFAULT_TREE)!;
  return {
    model: modelKind(properties.model),
    task: properties.task === "allSplits" ? "allSplits" : "fill",
    roof: text(house.roof),
    rows: house.rows.map(([l, r]) => [text(l), text(r)]),
    tree: editNode(tree),
    countZero: String(properties.countZero ?? "true") !== "false",
    orderMatters: String(properties.orderMatters ?? "true") !== "false",
    decimals: String(properties.decimals ?? "false") === "true",
  };
}

/** The rows of the house as the pupil will see them: for all splits, one for every split of the roof. */
function houseRows(a: Authored): [string, string][] {
  if (a.task !== "allSplits") return a.rows;
  const count = splitCount(parseNumber(a.roof, true) ?? null, a.countZero, a.orderMatters);
  return count === undefined ? a.rows : Array.from({ length: count }, (_, r) => a.rows[r] ?? ["", ""]);
}

const serializeEdit = (node: EditNode): string => box(node.value) + (node.parts.length ? `(${node.parts.map(serializeEdit).join("|")})` : "");

/** The settings the authoring mode writes, as strings. For all splits only the rows with a given box are kept. */
export function authoredProperties(a: Authored): Record<string, string> {
  let rows = houseRows(a);
  if (a.task === "allSplits") {
    rows = [...rows];
    while (rows.length && rows[rows.length - 1].every((typed) => typed.trim() === "")) rows.pop();
  }
  return {
    model: a.model,
    task: a.task,
    house: rows.length ? `${box(a.roof)}: ${rows.map(([l, r]) => `${box(l)}|${box(r)}`).join("; ")}` : box(a.roof),
    tree: serializeEdit(a.tree),
    countZero: String(a.countZero),
    orderMatters: String(a.orderMatters),
    decimals: String(a.decimals),
  };
}

const typedTexts = (a: Authored) => {
  const fromTree = (node: EditNode): string[] => [node.value, ...node.parts.flatMap(fromTree)];
  return a.model === "house" ? [a.roof, ...houseRows(a).flat()] : fromTree(a.tree);
};

/** What keeps Done from finishing, in the author's language: a box that is not a number, and the layout's problems. */
export function authoredProblems(a: Authored, language: Language): string[] {
  const { problems } = TEXTS[language];
  if (typedTexts(a).some((typed) => typed.trim() !== "" && parseNumber(typed, true) === undefined)) return [problems.notANumber];
  return layoutProblems(modelFrom(authoredProperties(a)), a.task).map((code) => problems[code]);
}

/** The shape of what the author made, every box the pupil's: the boxes and sums to draw, in the order of the texts. */
function shapeOf(a: Authored): Model {
  const blank = (node: EditNode): string => "?" + (node.parts.length ? `(${node.parts.map(blank).join("|")})` : "");
  const rows = houseRows(a);
  return modelFrom({ model: a.model, house: `?: ${rows.map(() => "?|?").join("; ")}`, tree: blank(a.tree) });
}

/** The boxes of the tree in reading order, each with the path of part indices that leads to it. */
function treePaths(node: EditNode, path: number[] = []): { node: EditNode; path: number[] }[] {
  return [{ node, path }, ...node.parts.flatMap((part, i) => treePaths(part, [...path, i]))];
}
/** The tree with the box at `path` changed. */
function changeAt(node: EditNode, path: number[], change: (node: EditNode) => EditNode): EditNode {
  if (path.length === 0) return change(node);
  const [i, ...rest] = path;
  return { ...node, parts: node.parts.map((part, k) => (k === i ? changeAt(part, rest, change) : part)) };
}
const editCount = (node: EditNode): number => (node.parts.length ? 1 : 0) + node.parts.reduce((n, p) => n + editCount(p), 0);
const emptyPart = (): EditNode => ({ value: "", parts: [] });

type Props = {
  initial: Authored;
  language: Language;
  onChange: (authored: Authored) => void;
};

export function Authoring({ initial, language, onChange }: Props) {
  const [a, setA] = useState(initial);
  const t = TEXTS[language];
  const change = (next: Partial<Authored>) => {
    const value = { ...a, ...next };
    setA(value);
    onChange(value);
  };

  const shape = shapeOf(a);
  const texts = typedTexts(a);
  const paths = treePaths(a.tree);
  const allSplits = a.model === "house" && a.task === "allSplits";
  const model = modelFrom(authoredProperties(a));
  const problems = authoredProblems(a, language);
  const unique = problems.length === 0 && uniqueSolution(model) !== null;

  /** The author types a number in box `index` (the order of shapeOf), or empties it for the pupil. */
  const setBox = (index: number, value: string) => {
    if (a.model === "tree") return change({ tree: changeAt(a.tree, paths[index].path, (node) => ({ ...node, value })) });
    if (index === 0) return change({ roof: value });
    const rows = shape.sums.map((_, r) => [...(houseRows(a)[r] ?? ["", ""])] as [string, string]);
    rows[Math.floor((index - 1) / 2)][(index - 1) % 2] = value;
    change({ rows });
  };

  const renderBox = (index: number, label: string) => (
    <input
      id={`author-box-${index}`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      maxLength={7}
      placeholder="?"
      pattern={numberPattern(true)}
      className={`box ${texts[index]?.trim() ? "author-given" : ""}`}
      aria-label={label}
      value={texts[index] ?? ""}
      onInput={(e) => setBox(index, e.currentTarget.value)}
    />
  );

  const rows = houseRows(a);
  const removeRow = (row: number) => change({ rows: rows.filter((_, r) => r !== row) });
  const rowAside = allSplits
    ? undefined
    : (row: number) => (
        <button type="button" className="author-button" aria-label={t.removeRow(row + 1)} title={t.removeRow(row + 1)} disabled={rows.length <= 1} onClick={() => removeRow(row)}>
          ×
        </button>
      );

  return (
    <div className="p-5 font-sans text-ink">
      <h2 className="text-xl font-semibold tracking-tight">{t.authoringTitle}</h2>
      <p className="text-slate-600">{t.authoringIntro}</p>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Options label={t.model}>
          <Option label={t.house} checked={a.model === "house"} onSelect={() => change({ model: "house" })} />
          <Option label={t.tree} checked={a.model === "tree"} onSelect={() => change({ model: "tree" })} />
        </Options>
        {a.model === "house" && (
          <Options label={t.task}>
            <Option label={t.fill} checked={a.task === "fill"} onSelect={() => change({ task: "fill" })} />
            <Option label={t.allSplits} checked={a.task === "allSplits"} onSelect={() => change({ task: "allSplits" })} />
          </Options>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 pl-[7em] text-sm">
          {allSplits && <Check label={t.countZero} checked={a.countZero} onChange={(countZero) => change({ countZero })} />}
          {allSplits && <Check label={t.orderMatters} checked={a.orderMatters} onChange={(orderMatters) => change({ orderMatters })} />}
          <Check label={t.decimals} checked={a.decimals} onChange={(decimals) => change({ decimals })} />
        </div>
      </div>

      <div className="mt-4 flex justify-center overflow-x-auto rounded-xl bg-paper px-16 py-6">
        <Drawing model={shape} renderBox={renderBox} t={t} rowAside={rowAside} />
      </div>

      {a.model === "house" && !allSplits && (
        <div className="mt-3 flex justify-center">
          <button type="button" className="author-button px-3" disabled={rows.length >= MAX_ROWS} onClick={() => change({ rows: [...rows, ["", ""]] })}>
            + {t.addRow}
          </button>
        </div>
      )}

      {a.model === "tree" && (
        <div className="mt-3">
          <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.splits}</h3>
          <ul className="mt-1 flex flex-col gap-1.5">
            {paths.map(({ node, path }, index) => {
              const label = boxLabel(shape, index, t);
              const split = shape.sums.findIndex((sum) => sum.whole === index);
              if (split >= 0) {
                return (
                  <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-[13em] font-semibold">{`${label} (${node.value.trim() || "?"})`}</span>
                    <Options label={t.legs(split + 1)} compact>
                      {[2, 3].map((legs) => (
                        <Option
                          key={legs}
                          label={legs === 2 ? t.twoLegs : t.threeLegs}
                          checked={node.parts.length === legs}
                          onSelect={() =>
                            change({ tree: changeAt(a.tree, path, (n) => ({ ...n, parts: legs === 2 ? n.parts.slice(0, 2) : [...n.parts, emptyPart()].slice(0, MAX_LEGS) })) })
                          }
                        />
                      ))}
                    </Options>
                    {path.length > 0 && (
                      <button type="button" className="author-button px-2" onClick={() => change({ tree: changeAt(a.tree, path, (n) => ({ ...n, parts: [] })) })}>
                        {t.unsplit(split + 1)}
                      </button>
                    )}
                  </li>
                );
              }
              const canSplit = path.length < MAX_DEPTH && editCount(a.tree) < MAX_ROWS;
              return canSplit ? (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <span className="w-[13em]">{`${label} (${node.value.trim() || "?"})`}</span>
                  <button
                    type="button"
                    className="author-button px-2"
                    aria-label={t.splitPart(label)}
                    onClick={() => change({ tree: changeAt(a.tree, path, (n) => ({ ...n, parts: [emptyPart(), emptyPart()] })) })}
                  >
                    + {t.split}
                  </button>
                </li>
              ) : null;
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm" role="status">
        {allSplits && problems.length === 0 && <p>{t.allSplitsRows(rows.length)}</p>}
        {problems.length ? (
          <ul className="list-disc pl-5 text-red-700">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : (
          <p className={unique ? "text-accent-strong" : "text-slate-600"}>{unique ? t.unique : t.notUnique}</p>
        )}
      </div>
    </div>
  );
}

/** A row of options of which one is picked: a radio group with its name in front. */
function Options({ label, compact, children }: { label: string; compact?: boolean; children: ComponentChildren }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      {!compact && (
        <span className="w-[6.5em] shrink-0 text-sm font-semibold text-slate-600" aria-hidden="true">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function Option({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`cursor-pointer rounded-md border-2 bg-white px-2.5 py-1 text-sm transition-colors ${
        checked ? "border-accent-strong bg-tint font-semibold text-accent-strong" : "border-slate-300 text-slate-700 hover:border-slate-500"
      }`}
    >
      {label}
    </button>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-6 cursor-pointer items-center gap-1.5">
      <input type="checkbox" className="h-4 w-4 accent-accent-strong" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      {label}
    </label>
  );
}
