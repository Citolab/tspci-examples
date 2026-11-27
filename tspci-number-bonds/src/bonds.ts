/*
 * The number bonds, without imports: the split house (splitshuis) and the number bond tree (splitsboom, splitsbeen), the
 * notation of their layout, the checks of the pupil's numbers, the response fields and the correct response. Pure
 * functions, so `npm test` runs them in node without a build (test/bonds.test.ts).
 *
 * Both models are boxes and sums. A sum is a whole and its parts: a row of the house (the roof and the two boxes of the
 * row), or a split of the tree (a box and the two or three boxes on its legs). Box 0 is the roof or the top of the tree.
 */

export type ModelKind = "house" | "tree";
export type Task = "fill" | "allSplits";

/** A box of the layout: a number the author gives (locked), or null: the pupil writes it. */
export type Given = number | null;

/** The house: the whole in the roof, rows of two boxes. */
export type House = { roof: Given; rows: [Given, Given][] };

/** The tree: a box, and two or three parts on legs below it, each of which may split again. */
export type TreeNode = { value: Given; parts: TreeNode[] };

/** A whole and its parts, as box indices. */
export type Sum = { whole: number; parts: number[] };

/**
 * The bonds the pupil sees: the given numbers per box, the sums to check, and for the tree the place of each box.
 * - house: box 0 the roof, then two boxes per row (row r: 1 + 2r and 2 + 2r); sum r is row r
 * - tree: the boxes in reading order (pre-order: a box, then each part with its own split); sum k is the k-th split
 */
export type Model = {
  kind: ModelKind;
  task: Task;
  given: Given[];
  sums: Sum[];
  /** tree: the box above each box (-1 for the top), and its depth */
  parent: number[];
  depth: number[];
  /** allSplits: the splits of the whole, every row a different one */
  countZero: boolean;
  orderMatters: boolean;
  decimals: boolean;
};

/** Up to twelve rows (house) or splits (tree): the response has a field row1 … row12. */
export const MAX_ROWS = 12;
/** Up to three levels of splits in a tree. */
export const MAX_DEPTH = 3;
export const MAX_LEGS = 3;

// ---- numbers ----

/**
 * A number as a pupil writes it: "7", " 40 ", and with decimals on "0,3" or "0.3". Undefined for anything else: "",
 * "-2", "3 4", "1/2", and a decimal while decimals are off. Up to 9999, at most two decimals.
 */
export function parseNumber(text: string, decimals = false): number | undefined {
  const trimmed = text.trim().replace(",", ".");
  const pattern = decimals ? /^\d{1,4}(\.\d{1,2})?$|^\.\d{1,2}$/ : /^\d{1,4}$/;
  return pattern.test(trimmed) ? Number(trimmed.startsWith(".") ? `0${trimmed}` : trimmed) : undefined;
}

/** The pattern of an input box, for the browser's validity: the same numbers as parseNumber. */
export const numberPattern = (decimals: boolean) => (decimals ? "\\s*(\\d{1,4}([.,]\\d{1,2})?|[.,]\\d{1,2})\\s*" : "\\s*\\d{1,4}\\s*");

/** A number as the response writes it: a decimal point, no trailing zeros (0.3, 7, 12.5). */
export const formatNumber = (n: number) => String(Math.round(n * 100) / 100);

/** A number as the pupil reads it: with a decimal comma in Dutch. */
export const showNumber = (n: number, language = "en") => (language === "nl" ? formatNumber(n).replace(".", ",") : formatNumber(n));

/** Two sums of decimals that are the same number (0.1 + 0.2 is 0.3). */
export const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** A given box in the notation: "?" or "" is the pupil's, anything else must be a number (with a comma or a point). */
function parseGiven(text: string): Given | "invalid" {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "?") return null;
  const n = parseNumber(trimmed, true);
  return n === undefined ? "invalid" : n;
}
const givenText = (value: Given, empty = "?") => (value === null ? empty : formatNumber(value));

// ---- the notation of the house: "7: 3|?; ?|2; ?|?" ----

/**
 * The house as the author writes it: the roof, a colon, and the rows separated by ";", the two boxes of a row by "|".
 * "?" (or nothing) is a box the pupil fills in. "7: 3|?; ?|2" is the roof 7 with the rows 3 and ?, ? and 2; "?: 3|4"
 * asks for the whole. Without a colon, a text with "|" is rows only (the roof is the pupil's) and a text without one is
 * only the roof (for all splits). Unknown parts are the pupil's boxes; null when it is no house at all.
 */
export function parseHouse(text: string): House | null {
  if (typeof text !== "string") return null;
  const colon = text.indexOf(":");
  const [roofText, rowsText] = colon >= 0 ? [text.slice(0, colon), text.slice(colon + 1)] : text.includes("|") ? ["", text] : [text, ""];
  const roof = parseGiven(roofText);
  if (roof === "invalid") return null;
  const rows: [Given, Given][] = [];
  for (const part of rowsText.split(";")) {
    if (part.trim() === "") continue;
    const boxes = part.split("|");
    if (boxes.length !== 2) return null;
    const [left, right] = boxes.map(parseGiven);
    if (left === "invalid" || right === "invalid") return null;
    rows.push([left, right]);
  }
  if (rows.length > MAX_ROWS) rows.length = MAX_ROWS;
  return { roof, rows };
}

export const serializeHouse = (house: House, empty = "?") =>
  `${givenText(house.roof, empty)}: ${house.rows.map(([l, r]) => `${givenText(l, empty)}|${givenText(r, empty)}`).join("; ")}`;

// ---- the notation of the tree: "47(40|7)", "8(5|3(2|1))" ----

/**
 * The tree as the author writes it: a box, and its parts between brackets, separated by "|": "47(40|?)" is 47 split in
 * 40 and a box for the pupil; "?(5|3)" asks for the whole; "13(10|3(?|?))" splits again. "?" (or nothing) is the
 * pupil's. Two or three parts per split, up to three levels. Null when it is not a tree.
 */
export function parseTree(text: string): TreeNode | null {
  if (typeof text !== "string") return null;
  let at = 0;
  const node = (depth: number): TreeNode | null => {
    const start = at;
    while (at < text.length && !"(|)".includes(text[at])) at++;
    const value = parseGiven(text.slice(start, at));
    if (value === "invalid") return null;
    const parts: TreeNode[] = [];
    if (text[at] === "(") {
      if (depth >= MAX_DEPTH) return null;
      at++;
      for (;;) {
        const part = node(depth + 1);
        if (!part) return null;
        parts.push(part);
        if (text[at] === "|") at++;
        else if (text[at] === ")") {
          at++;
          break;
        } else return null;
      }
      if (parts.length < 2 || parts.length > MAX_LEGS) return null;
    }
    return { value, parts };
  };
  const tree = node(0);
  if (!tree || text.slice(at).trim() !== "") return null;
  const splits = countSplits(tree);
  if (splits < 1 || splits > MAX_ROWS) return null;
  return tree;
}

export const serializeTree = (node: TreeNode, empty = "?"): string =>
  givenText(node.value, empty) + (node.parts.length ? `(${node.parts.map((part) => serializeTree(part, empty)).join("|")})` : "");

export const countSplits = (node: TreeNode): number => (node.parts.length ? 1 : 0) + node.parts.reduce((n, part) => n + countSplits(part), 0);
export const treeDepth = (node: TreeNode): number => (node.parts.length ? 1 + Math.max(...node.parts.map(treeDepth)) : 0);

// ---- all splits ----

/**
 * Every split of a whole number in two parts: [0, 7], [1, 6] … [7, 0]. Without zero, no [0, 7] and [7, 0]; when the
 * order does not matter, [3, 4] and [4, 3] are one split, written small first.
 */
export function allSplitsOf(whole: number, countZero: boolean, orderMatters: boolean): [number, number][] {
  const splits: [number, number][] = [];
  if (!Number.isInteger(whole) || whole < 0) return splits;
  for (let left = countZero ? 0 : 1; left <= whole - (countZero ? 0 : 1); left++) {
    const right = whole - left;
    if (orderMatters || left <= right) splits.push([left, right]);
  }
  return splits;
}

// ---- the settings → the model ----

export type Settings = {
  model?: string;
  task?: string;
  house?: string;
  tree?: string;
  countZero?: string | boolean;
  orderMatters?: string | boolean;
  decimals?: string | boolean;
};

export const DEFAULT_HOUSE = "7: 3|?; ?|2; 6|?; ?|?";
export const DEFAULT_TREE = "47(40|?)";
const isTrue = (value: string | boolean | undefined, fallback: boolean) => (value === undefined || value === "" ? fallback : String(value) === "true");

export const modelKind = (model?: string): ModelKind => (model === "house" ? "house" : "tree"); // the tree is the default

/**
 * The model the pupil sees, from the settings. A layout that cannot be read is the default one. "All splits" is only
 * for the house, with a whole number in the roof: then it has a row for every split (at most twelve), and the given
 * boxes of the layout's rows are in the rows from the top.
 */
export function modelFrom(settings: Settings): Model {
  const kind = modelKind(settings.model);
  const decimals = isTrue(settings.decimals, false);
  const countZero = isTrue(settings.countZero, true);
  const orderMatters = isTrue(settings.orderMatters, true);
  const base = { kind, decimals, countZero, orderMatters };
  if (kind === "tree") {
    const tree = parseTree(settings.tree ?? "") ?? parseTree(DEFAULT_TREE)!; // a tree has at least one split
    return { ...base, task: "fill", ...treeBoxes(tree) };
  }
  let house = parseHouse(settings.house ?? "") ?? parseHouse(DEFAULT_HOUSE)!;
  let task: Task = settings.task === "allSplits" ? "allSplits" : "fill";
  if (task === "allSplits") {
    const count = splitCount(house.roof, countZero, orderMatters);
    if (count === undefined) task = "fill";
    else house = { roof: house.roof, rows: Array.from({ length: count }, (_, r) => house.rows[r] ?? [null, null]) };
  }
  if (house.rows.length === 0) house = { ...house, rows: [[null, null]] };
  return { ...base, task, ...houseBoxes(house) };
}

/** The number of rows "all splits" gives this roof, or undefined when it cannot (no whole number, more than twelve). */
export function splitCount(roof: Given, countZero: boolean, orderMatters: boolean): number | undefined {
  if (roof === null || !Number.isInteger(roof)) return undefined;
  const count = allSplitsOf(roof, countZero, orderMatters).length;
  return count >= 1 && count <= MAX_ROWS ? count : undefined;
}

function houseBoxes(house: House) {
  const given: Given[] = [house.roof, ...house.rows.flat()];
  const sums = house.rows.map((_, r) => ({ whole: 0, parts: [1 + 2 * r, 2 + 2 * r] }));
  return { given, sums, parent: given.map((_, i) => (i === 0 ? -1 : 0)), depth: given.map((_, i) => (i === 0 ? 0 : 1)) };
}

function treeBoxes(tree: TreeNode) {
  const given: Given[] = [];
  const parent: number[] = [];
  const depth: number[] = [];
  const sums: Sum[] = [];
  const visit = (node: TreeNode, above: number, level: number) => {
    const index = given.length;
    given.push(node.value);
    parent.push(above);
    depth.push(level);
    if (node.parts.length) {
      const sum: Sum = { whole: index, parts: [] };
      sums.push(sum);
      for (const part of node.parts) sum.parts.push(visit(part, index, level + 1));
    }
    return index;
  };
  visit(tree, -1, 0);
  return { given, sums, parent, depth };
}

/** The tree of a model again (the boxes in reading order), with these values in it. */
export function treeOf(model: Model, values: Given[] = model.given): TreeNode {
  const build = (index: number): TreeNode => ({
    value: values[index] ?? null,
    parts: model.sums.find((sum) => sum.whole === index)?.parts.map(build) ?? [],
  });
  return build(0);
}

/** The house of a model again, with these values in it. */
export const houseOf = (model: Model, values: Given[] = model.given): House => ({
  roof: values[0] ?? null,
  rows: model.sums.map(({ parts: [l, r] }) => [values[l] ?? null, values[r] ?? null]),
});

// ---- the pupil's numbers: the checks ----

/** The boxes as the pupil sees them: the given numbers, and what the pupil typed in the others. */
export const startValues = (model: Model, language = "en"): string[] => model.given.map((value) => (value === null ? "" : showNumber(value, language)));

/** The numbers in the boxes: a given one, the pupil's number, or null (empty, or not a number). */
export const valuesOf = (model: Model, texts: string[]): Given[] =>
  model.given.map((given, i) => given ?? parseNumber(texts[i] ?? "", model.decimals) ?? null);

/** Whether the pupil filled in any box: nothing answered, nothing reported. */
export const answered = (model: Model, texts: string[]) => model.given.some((given, i) => given === null && (texts[i] ?? "").trim() !== "");

/** A row or split that adds up: every box of it holds a number, and the parts add up to the whole. */
export function sumHolds(sum: Sum, values: Given[]): boolean {
  const whole = values[sum.whole];
  const parts = sum.parts.map((i) => values[i]);
  if (whole === null || parts.some((part) => part === null)) return false;
  return sameNumber(parts.reduce((a, b) => a + b, 0), whole);
}

/** A split of a row as one key: [3, 4] and [4, 3] are the same split when the order does not matter. */
const splitKey = (parts: number[], orderMatters: boolean) => (orderMatters ? parts : [...parts].sort((a, b) => a - b)).map(formatNumber).join("|");

export type Checks = {
  /** every box holds a number and every row or split adds up (the given numbers are in it, locked) */
  correct: boolean;
  /** per row or split, in order: it adds up; in "all splits" also: it is a split that counts, and not one of an earlier row */
  rows: boolean[];
  /** the rows or splits that count (rows) */
  correctRows: number;
  /** all splits: every split of the whole is there (and so none twice) */
  complete: boolean;
  /** all splits: the rows that add up but do not count, as they repeat an earlier row or have a 0 that does not count */
  notCounted: boolean[];
};

/**
 * The checks of the pupil's numbers, on their own numbers: a row adds up when its two boxes add up to the roof, a split
 * when its parts add up to its whole. "All splits" also asks every row to be a different split: a row that repeats an
 * earlier one, or that has a 0 while 0 does not count, still adds up (`correct`), but it is not a split found.
 */
export function check(model: Model, texts: string[]): Checks {
  const values = valuesOf(model, texts);
  const holds = model.sums.map((sum) => sumHolds(sum, values));
  const correct = values.every((value) => value !== null) && holds.every(Boolean);
  if (model.task !== "allSplits") {
    return { correct, rows: holds, correctRows: holds.filter(Boolean).length, complete: false, notCounted: holds.map(() => false) };
  }
  const splits = allSplitsOf(model.given[0] ?? -1, model.countZero, model.orderMatters);
  const allowed = new Set(splits.map((split) => splitKey(split, model.orderMatters)));
  const seen = new Set<string>();
  const rows = model.sums.map((sum, r) => {
    if (!holds[r]) return false;
    const key = splitKey(sum.parts.map((i) => values[i]!), model.orderMatters);
    if (!allowed.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const correctRows = rows.filter(Boolean).length;
  return { correct, rows, correctRows, complete: correctRows === splits.length, notCounted: holds.map((h, r) => h && !rows[r]) };
}

// ---- the notation of the pupil's numbers (the `numbers` field) ----

/**
 * The pupil's numbers in the notation of the layout, every box filled in or empty: "7: 3|4; 5|2" or "47(40|7)". In
 * "all splits" the rows are sorted (and, when the order does not matter, each row small first), so every pupil who
 * finds the same splits reports the same numbers, in whatever order they wrote them.
 */
export function numbersOf(model: Model, values: Given[]): string {
  if (model.kind === "tree") return serializeTree(treeOf(model, values), "");
  let house = houseOf(model, values);
  if (model.task === "allSplits") {
    const rows = house.rows.map(([l, r]): [Given, Given] => (!model.orderMatters && l !== null && r !== null && r < l ? [r, l] : [l, r]));
    const key = (x: Given) => (x === null ? Infinity : x);
    rows.sort((a, b) => key(a[0]) - key(b[0]) || key(a[1]) - key(b[1]));
    house = { ...house, rows };
  }
  return serializeHouse(house, "");
}

/**
 * The pupil's texts from the `numbers` of a response (setResponse, a correct response): the numbers in the boxes the
 * pupil fills in, the given ones as they are. Null when the numbers are not of this layout. In "all splits" a row of the
 * response goes to a row whose given boxes it fits, the rest from the top.
 */
export function textsFromNumbers(model: Model, numbers: string, language = "en"): string[] | null {
  const show = (value: Given) => (value === null ? "" : showNumber(value, language));
  const texts = startValues(model, language);
  if (model.kind === "tree") {
    const tree = parseTree(numbers);
    if (!tree) return null;
    const boxes = treeBoxes(tree);
    if (boxes.given.length !== model.given.length || boxes.parent.some((p, i) => p !== model.parent[i])) return null;
    boxes.given.forEach((value, i) => {
      if (model.given[i] === null) texts[i] = show(value);
    });
    return texts;
  }
  const house = parseHouse(numbers);
  if (!house || house.rows.length > model.sums.length) return null;
  if (model.given[0] === null) texts[0] = show(house.roof);
  const fits = (row: [Given, Given], r: number) => row.every((value, side) => model.given[1 + 2 * r + side] === null || value === model.given[1 + 2 * r + side]);
  const placed: ([Given, Given] | undefined)[] = Array(model.sums.length).fill(undefined);
  const rest = [...house.rows];
  if (model.task === "allSplits") {
    for (let r = 0; r < model.sums.length; r++) {
      if (model.given[1 + 2 * r] === null && model.given[2 + 2 * r] === null) continue;
      let at = rest.findIndex((row) => fits(row, r));
      if (at < 0) at = rest.findIndex((row) => fits([row[1], row[0]], r));
      if (at >= 0) placed[r] = fits(rest[at], r) ? rest.splice(at, 1)[0] : (([a, b]) => [b, a] as [Given, Given])(rest.splice(at, 1)[0]);
    }
  }
  for (let r = 0; r < model.sums.length; r++) placed[r] ??= rest.shift();
  placed.forEach((row, r) => {
    if (!row) return;
    for (const side of [0, 1]) if (model.given[1 + 2 * r + side] === null) texts[1 + 2 * r + side] = show(row[side]);
  });
  return texts;
}

// ---- the response ----

export type Field = { name: string; type: "boolean" | "integer" | "string"; value: boolean | number | string };

/** The fields of the response record, in order (config.tspci.response in package.json). */
export function responseFields(model: Model, texts: string[]): Field[] {
  const checks = check(model, texts);
  const fields: Field[] = [
    { name: "correct", type: "boolean", value: checks.correct },
    { name: "correctRows", type: "integer", value: checks.correctRows },
  ];
  if (model.task === "allSplits") fields.push({ name: "complete", type: "boolean", value: checks.complete });
  fields.push({ name: "numbers", type: "string", value: numbersOf(model, valuesOf(model, texts)) });
  checks.rows.forEach((holds, r) => fields.push({ name: `row${r + 1}`, type: "boolean", value: holds }));
  return fields;
}

// ---- the correct answer ----

/**
 * The one answer of the layout, as numbers per box, or null when there is more than one (a row with two empty boxes, a
 * split with two unknown parts) or none (a part larger than its whole). Every sum with one unknown box gives it, until
 * nothing changes. "All splits" has one answer up to the order of the rows: every split once.
 */
export function uniqueSolution(model: Model): number[] | null {
  if (model.task === "allSplits") {
    const roof = model.given[0];
    if (roof === null) return null;
    const splits = allSplitsOf(roof, model.countZero, model.orderMatters);
    if (splits.length !== model.sums.length) return null;
    const values: Given[] = [roof, ...Array(model.sums.length * 2).fill(null)];
    const texts = textsFromNumbers(model, serializeHouse({ roof, rows: splits }), "en");
    if (!texts) return null;
    const filled = valuesOf(model, texts).map((value, i) => value ?? values[i]);
    return filled.every((value) => value !== null) && check(model, texts).complete ? (filled as number[]) : null;
  }
  const values = solve(model);
  return values && values.every((value) => value !== null) ? (values as number[]) : null;
}

/** Fills in every box that follows from the others; null when a box would have to be negative or a sum cannot hold. */
function solve(model: Model): Given[] | null {
  const values = [...model.given];
  let changed = true;
  while (changed) {
    changed = false;
    for (const sum of model.sums) {
      const boxes = [sum.whole, ...sum.parts];
      const unknown = boxes.filter((i) => values[i] === null);
      if (unknown.length === 0) {
        if (!sumHolds(sum, values)) return null;
        continue;
      }
      if (unknown.length > 1) continue;
      const partsKnown = sum.parts.filter((i) => values[i] !== null).reduce((a, i) => a + values[i]!, 0);
      const value = unknown[0] === sum.whole ? partsKnown : values[sum.whole]! - partsKnown;
      if (value < -1e-9) return null;
      values[unknown[0]] = Math.round(value * 100) / 100;
      changed = true;
    }
  }
  return values;
}

/**
 * One answer for every layout, for status "solution" without a correct response in the item: the unique one, or else
 * the boxes that follow from the others, and the free ones split as a teacher would (47 in 40 and 7, then halves;
 * different splits in the rows of a house that are still empty).
 */
export function exampleSolution(model: Model): Given[] {
  const unique = uniqueSolution(model);
  if (unique) return unique;
  const values = solve(model) ?? [...model.given];
  if (model.kind === "house") {
    if (values[0] === null) values[0] = 10;
    const roof = values[0];
    const used = new Set(model.sums.filter((sum) => sumHolds(sum, values)).map((sum) => splitKey(sum.parts.map((i) => values[i]!), model.orderMatters)));
    const splits = Number.isInteger(roof) ? allSplitsOf(roof, model.countZero, model.orderMatters) : [];
    for (const sum of model.sums) {
      const [l, r] = sum.parts;
      if (values[l] !== null || values[r] !== null) continue;
      const split = splits.find((s) => !used.has(splitKey(s, model.orderMatters))) ?? [roof, 0];
      used.add(splitKey(split, model.orderMatters));
      [values[l], values[r]] = split;
    }
    return solve({ ...model, given: values }) ?? values;
  }
  // tree: from the top down, a box with unknown parts splits in tens and ones, or else in (nearly) equal parts
  const fill = (index: number) => {
    const sum = model.sums.find((s) => s.whole === index);
    if (!sum) return;
    if (values[index] === null) values[index] = sum.parts.reduce((a, i) => a + (values[i] ?? 5), 0);
    const known = sum.parts.filter((i) => values[i] !== null).reduce((a, i) => a + values[i]!, 0);
    const free = sum.parts.filter((i) => values[i] === null);
    let rest = Math.max(0, values[index]! - known);
    free.forEach((i, k) => {
      const left = free.length - k;
      const share =
        left === 1 ? rest
        : free.length === 2 && rest > 10 && Number.isInteger(rest) && rest % 10 !== 0 ? rest - (rest % 10) // 47: 40 and 7
        : Number.isInteger(rest) && rest >= left ? Math.floor(rest / left)
        : Math.round((rest / left) * 10) / 10; // 1: 0.5 and 0.5
      values[i] = Math.round(share * 100) / 100;
      rest -= values[i]!;
    });
    sum.parts.forEach(fill);
  };
  fill(0);
  return values;
}

// ---- problems of a layout (the authoring mode) ----

export type Problem = "noRows" | "givenSumWrong" | "negative" | "allSplitsRoof" | "allNumbersGiven" | "decimalsOff";

/** What is wrong with a layout an author made, as codes the authoring mode words (texts.ts). */
export function layoutProblems(model: Model, requestedTask: Task): Problem[] {
  const problems: Problem[] = [];
  if (model.sums.length === 0) problems.push("noRows");
  if (requestedTask === "allSplits" && model.task !== "allSplits") problems.push("allSplitsRoof");
  if (model.sums.some((sum) => [sum.whole, ...sum.parts].every((i) => model.given[i] !== null) && !sumHolds(sum, model.given))) problems.push("givenSumWrong");
  else if (!problems.length && solve(model) === null) problems.push("negative");
  if (model.given.every((value) => value !== null)) problems.push("allNumbersGiven");
  if (!model.decimals && model.given.some((value) => value !== null && !Number.isInteger(value))) problems.push("decimalsOff");
  return problems;
}

// ---- the drawing of the tree ----

export type Point = { x: number; y: number };

/**
 * Where each box of the tree is, in units of a box slot: a part without a split of its own takes one slot, a box with
 * parts sits above the middle of its parts. Levels are one unit apart. Returns the centres and the size of the drawing.
 */
export function treeLayout(model: Model): { at: Point[]; width: number; height: number } {
  const at: Point[] = model.given.map(() => ({ x: 0, y: 0 }));
  let next = 0;
  const place = (index: number): number => {
    const sum = model.sums.find((s) => s.whole === index);
    const x = sum ? (() => {
      const xs = sum.parts.map(place);
      return (xs[0] + xs[xs.length - 1]) / 2;
    })() : next++ + 0.5;
    at[index] = { x, y: model.depth[index] };
    return x;
  };
  place(0);
  return { at, width: Math.max(next, 1), height: Math.max(...model.depth) + 1 };
}
