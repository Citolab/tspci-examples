/**
 * The written methods, without a DOM: the task from the settings, the pupil's working, the checks of that working and
 * the response. Tested in node (npm test, test/calculation.test.ts); index.tsx and interaction.tsx use it.
 *
 * - Hapmethode (mode "chunking"), 432 : 12. The pupil takes bites: 10 × 12 = 120 off 432 leaves 312, 20 × 12 = 240
 *   leaves 72, 6 × 12 = 72 leaves 0. The factors (10, 20, 6) are in a column on the right; together they are the answer
 *   (36), and what is left at the end is the remainder.
 * - Kolomsgewijs (mode "columns"), 345 + 278. The pupil writes a partial result per place value, from the left
 *   (300 + 200 = 500, 40 + 70 = 110, 5 + 8 = 13), and adds them up (623). Subtracting may give a negative partial
 *   (432 − 178: 300, −40, −6 → 254).
 *
 * The working is checked against the pupil's own numbers, as a teacher reads it on paper: any choice of bites is
 * fine, as long as every bite is factor × divisor, every subtraction is right and the answer follows from the rows.
 */

export type Mode = "chunking" | "columns";
export type Operation = "add" | "subtract";

/** What the author sets: the method and the two numbers (for the hapmethode: the number to divide and the divisor). */
export type Task = { mode: Mode; operation: Operation; first: number; second: number };

/** A whole number in the settings has at most this many digits: the boxes are as wide as the numbers. */
export const MAX_DIGITS = 7;
/** Bites in the hapmethode: at least one row, at most this many. */
export const MIN_CHUNKS = 1;
export const MAX_CHUNKS = 12;
export const DEFAULT_CHUNKS = 3;

/** One bite of the hapmethode, as typed: the bite (120), the factor in the column on the right (10), what is left (312). */
export type ChunkRow = { bite: string; factor: string; rest: string };

/**
 * Everything the pupil writes, as typed (also when it is not a number yet). The method decides which part is used:
 * - chunks, factorTotal (the factors added up under their column), remainder: the hapmethode
 * - partials (one per place value, from the left), total (the partials added up): kolomsgewijs
 * - answer: both (the number after "=")
 */
export type Work = {
  chunks: ChunkRow[];
  factorTotal: string;
  partials: string[];
  total: string;
  answer: string;
  remainder: string;
};

// ---- numbers

/** A setting that is a whole number: "432", " 12 ". Null for anything else. */
export function parseWhole(text: unknown): number | null {
  const trimmed = String(text ?? "").trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * A number as a pupil writes it: "36", "−40" or "-40", "1 200", and in Dutch a decimal comma ("36,5") and a point
 * between groups of three digits ("1.200" is twelve hundred); in English the other way around ("1,200", "36.5"). A
 * comma or point that is not between groups of three is read as a decimal sign in both languages ("8.4" in Dutch is
 * 8,4). Null for anything else: "", "?", "36 r 0".
 */
export function parseNumber(text: string, language = "en"): number | null {
  let s = String(text ?? "")
    .trim()
    .replace(/[−–]/g, "-") // − and – as a minus
    .replace(/(\d)[\s   ]+(?=\d)/g, "$1"); // spaces between digits group thousands
  const group = language === "nl" ? "." : ",";
  const decimal = language === "nl" ? "," : ".";
  const grouped = new RegExp(`^-?\\d{1,3}(\\${group}\\d{3})+(\\${decimal}\\d+)?$`);
  if (grouped.test(s)) s = s.split(group).join("");
  s = s.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Object.is(n, -0) ? 0 : n;
}

/** Equal up to rounding (a decimal answer such as 36,5). */
export const same = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** A whole number as the pupil sees it in a worked solution: plain digits, a real minus sign. */
export const formatWhole = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

/** A number as the response reports it, in the language of the PCI: 36,5 in Dutch, 36.5 in English. */
export const formatNumber = (n: number, language = "en") => {
  const text = formatWhole(n);
  return language === "nl" ? text.replace(".", ",") : text;
};

// ---- the task

/** The task from the settings (strings, as data- attributes are). */
export function parseTask(p: { mode?: string; operation?: string; first?: string; second?: string }): Task {
  return {
    mode: p.mode === "columns" ? "columns" : "chunking",
    operation: p.operation === "subtract" ? "subtract" : "add",
    first: parseWhole(p.first) ?? NaN,
    second: parseWhole(p.second) ?? NaN,
  };
}

/** What keeps the settings from making a calculation, as keys of the texts (texts.ts): empty when it is fine. */
export type Problem = "first" | "second" | "divisorZero" | "tooLong";
export function taskProblems(task: Task): Problem[] {
  const problems: Problem[] = [];
  if (!Number.isInteger(task.first)) problems.push("first");
  if (!Number.isInteger(task.second)) problems.push("second");
  if (task.mode === "chunking" && task.second === 0) problems.push("divisorZero");
  if ([task.first, task.second].some((n) => Number.isInteger(n) && String(n).length > MAX_DIGITS)) problems.push("tooLong");
  return problems;
}
export const validTask = (task: Task) => taskProblems(task).length === 0;

/** The number of place values of kolomsgewijs: the digits of the longer number (345 + 78: 3, hundreds to ones). */
export const placesOf = (task: Task) => Math.max(1, String(task.first).length, String(task.second).length);

/** The digit of n at place p (0: ones, 1: tens, ...). */
const digit = (n: number, p: number) => Math.floor(n / 10 ** p) % 10;

/** The correct answer: the sum, the difference, or the quotient and remainder. */
export function correctAnswer(task: Task): { answer: number; remainder?: number } | null {
  if (!validTask(task)) return null;
  if (task.mode === "chunking") return { answer: Math.floor(task.first / task.second), remainder: task.first % task.second };
  return { answer: task.operation === "subtract" ? task.first - task.second : task.first + task.second };
}

/** The partial results of kolomsgewijs from the left: 345 + 278 → 500, 110, 13; 432 − 178 → 300, −40, −6. */
export function partialsOf(task: Task): number[] {
  const sign = task.operation === "subtract" ? -1 : 1;
  return Array.from({ length: placesOf(task) }, (_, i) => {
    const p = placesOf(task) - 1 - i;
    return (digit(task.first, p) + sign * digit(task.second, p)) * 10 ** p;
  });
}

// ---- the pupil's working

/** An empty working: the given number of bites for the hapmethode, a partial per place value for kolomsgewijs. */
export function startWork(task: Task, chunks = DEFAULT_CHUNKS): Work {
  const rows = Math.min(MAX_CHUNKS, Math.max(MIN_CHUNKS, Number.isInteger(chunks) ? chunks : DEFAULT_CHUNKS));
  return {
    chunks: Array.from({ length: rows }, () => ({ bite: "", factor: "", rest: "" })),
    factorTotal: "",
    partials: Array.from({ length: validTask(task) ? placesOf(task) : 1 }, () => ""),
    total: "",
    answer: "",
    remainder: "",
  };
}

const blank = (text: string) => String(text ?? "").trim() === "";

/** The checks of a hapmethode working. */
export type ChunkCheck = {
  /** Per row that is used (rows left empty are skipped): the bite is factor × divisor, and what is left is right. */
  rows: { row: number; bite: boolean; rest: boolean }[];
  /** What is left at the end (the dividend when no bite was taken). */
  left: number | null;
  /** The factors added up. */
  sum: number | null;
  /** What is left at the end is less than the divisor (and not below zero): the division is done. */
  done: boolean;
  /** The total under the factor column is their sum, or is left empty. */
  factorTotal: boolean;
  /** The answer is the sum of the factors, and the remainder what is left. */
  follows: boolean;
  working: boolean;
};

export function checkChunking(task: Task, work: Work, language = "en"): ChunkCheck {
  const num = (text: string) => parseNumber(text, language);
  const divisor = task.second;
  let previous: number | null = task.first;
  let sum: number | null = 0;
  const rows: ChunkCheck["rows"] = [];
  work.chunks.forEach((chunk, row) => {
    if (blank(chunk.bite) && blank(chunk.factor) && blank(chunk.rest)) return;
    const [bite, factor, rest] = [num(chunk.bite), num(chunk.factor), num(chunk.rest)];
    const biteOk = factor !== null && Number.isInteger(factor) && factor > 0 && same(bite, factor * divisor);
    const restOk = previous !== null && bite !== null && rest !== null && rest >= 0 && same(rest, previous - bite);
    rows.push({ row, bite: biteOk, rest: restOk });
    previous = rest;
    sum = sum !== null && factor !== null ? sum + factor : null;
  });
  const left = previous;
  const done = left !== null && Number.isInteger(left) && left >= 0 && left < divisor;
  const factorTotal = blank(work.factorTotal) || same(num(work.factorTotal), sum);
  const answer = num(work.answer);
  const remainder = blank(work.remainder) ? 0 : num(work.remainder);
  const follows = same(answer, sum) && same(remainder, left);
  // no bite at all is only right when there is nothing to take (5 : 12 = 0 rest 5)
  const bites = rows.length > 0 || task.first < divisor;
  const working = validTask(task) && bites && rows.every((r) => r.bite && r.rest) && done && factorTotal && follows;
  return { rows, left, sum, done, factorTotal, follows, working };
}

/** The checks of a kolomsgewijs working. */
export type ColumnCheck = {
  /** Per row: its partial is the one for that place value (from the left; or all of them from the right). */
  partials: boolean[];
  /** The partials are written from the right (ones first) instead of from the left. */
  fromRight: boolean;
  /** The partials added up (an empty partial is 0); null when one is not a number. */
  sum: number | null;
  /** The total under the partials is their sum, or is left empty. */
  total: boolean;
  /** The answer is the sum of the partials. */
  follows: boolean;
  working: boolean;
};

export function checkColumns(task: Task, work: Work, language = "en"): ColumnCheck {
  const num = (text: string) => parseNumber(text, language);
  const expected = validTask(task) ? partialsOf(task) : [];
  const rows = work.partials.slice(0, Math.max(expected.length, work.partials.length));
  // a partial is right when it is the one for its place, or left empty where that one is 0 (340 + 250: no ones)
  const matches = (order: number[]) => rows.map((text, i) => (blank(text) ? order[i] === 0 : same(num(text), order[i] ?? NaN)));
  const fromLeft = matches(expected);
  const reversed = matches([...expected].reverse());
  const fromRight = !fromLeft.every(Boolean) && reversed.every(Boolean) && expected.length > 1;
  const partials = fromRight ? reversed : fromLeft;
  const written = rows.filter((text) => !blank(text)).map(num);
  const sum = written.some((n) => n === null) ? null : written.reduce((a, b) => a + b, 0);
  const total = blank(work.total) || same(num(work.total), sum);
  const follows = same(num(work.answer), sum);
  const working =
    validTask(task) && rows.length === expected.length && written.length > 0 && partials.every(Boolean) && total && follows;
  return { partials, fromRight, sum, total, follows, working };
}

// ---- the response

/** The fields of the response; null while there is no answer (or the remainder is not a whole number). */
export type ResponseFields = { answer: number; remainder?: number; working: boolean; answerCorrect?: boolean };

export function responseFields(task: Task, work: Work, language = "en"): ResponseFields | null {
  const answer = parseNumber(work.answer, language);
  if (answer === null) return null;
  const correct = correctAnswer(task);
  if (task.mode === "chunking") {
    const remainder = blank(work.remainder) ? 0 : parseNumber(work.remainder, language);
    if (remainder === null || !Number.isInteger(remainder)) return null;
    const fields: ResponseFields = { answer, remainder, working: checkChunking(task, work, language).working };
    if (correct) fields.answerCorrect = same(answer, correct.answer) && remainder === correct.remainder;
    return fields;
  }
  const fields: ResponseFields = { answer, working: checkColumns(task, work, language).working };
  if (correct) fields.answerCorrect = same(answer, correct.answer);
  return fields;
}

/** The correct response for the settings: the answer (and remainder), a correct working. Null for broken settings. */
export function correctFields(task: Task): ResponseFields | null {
  const correct = correctAnswer(task);
  if (!correct) return null;
  return { ...correct, working: true, answerCorrect: true };
}

type RecordField = { name: string; base: Record<string, number | boolean> };

/** The fields as a QTI record (getResponse): answer float, remainder integer, working and answerCorrect boolean. */
export function toRecord(fields: ResponseFields): { record: RecordField[] } {
  const record: RecordField[] = [{ name: "answer", base: { float: fields.answer } }];
  if (fields.remainder !== undefined) record.push({ name: "remainder", base: { integer: fields.remainder } });
  record.push({ name: "working", base: { boolean: fields.working } });
  if (fields.answerCorrect !== undefined) record.push({ name: "answerCorrect", base: { boolean: fields.answerCorrect } });
  return { record };
}

/**
 * The answer and remainder in a response (setResponse, boundTo, a declared correct response): a record's answer and
 * remainder fields, or a plain number. Null when there is no number in it.
 */
export function fromResponse(value: unknown): { answer: number; remainder?: number } | null {
  const numberIn = (v: unknown): number | null => {
    if (Array.isArray(v)) return numberIn(v[0]);
    if (v && typeof v === "object") {
      const o = v as { base?: Record<string, unknown>; value?: unknown };
      if (o.base) return numberIn(o.base.float ?? o.base.integer ?? o.base.double ?? o.base.string);
      if ("value" in o) return numberIn(o.value);
      return null;
    }
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") return parseNumber(v);
    return null;
  };
  if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { record?: unknown }).record)) {
    const record = (value as { record: { name: string }[] }).record;
    const answer = numberIn(record.find((f) => f.name === "answer"));
    if (answer === null) return null;
    const remainder = numberIn(record.find((f) => f.name === "remainder"));
    return remainder === null ? { answer } : { answer, remainder };
  }
  const answer = numberIn(value);
  return answer === null ? null : { answer };
}

/**
 * A worked solution, as a pupil would write it (status "solution"): the hapmethode with a bite per digit of the
 * quotient (432 : 12: 30 × 12 = 360, then 6 × 12 = 72), kolomsgewijs from the left. The answer (and remainder) are the
 * given ones when the item declares another correct response.
 */
export function solutionWork(task: Task, given: { answer: number; remainder?: number } | null = null, language = "en"): Work {
  const work = startWork(task, 1);
  const correct = correctAnswer(task);
  if (!correct) return work;
  if (task.mode === "chunking") {
    const quotient = correct.answer;
    let left = task.first;
    const chunks: ChunkRow[] = [];
    for (let p = String(quotient).length - 1; p >= 0; p--) {
      const factor = digit(quotient, p) * 10 ** p;
      if (factor === 0) continue;
      left -= factor * task.second;
      chunks.push({ bite: formatWhole(factor * task.second), factor: formatWhole(factor), rest: formatWhole(left) });
    }
    work.chunks = chunks.length ? chunks : [{ bite: "", factor: "", rest: "" }];
    work.factorTotal = chunks.length > 1 ? formatWhole(quotient) : "";
    const answer = given?.answer ?? quotient;
    const remainder = given?.remainder ?? correct.remainder;
    work.answer = formatNumber(answer, language);
    work.remainder = formatWhole(remainder);
  } else {
    const partials = partialsOf(task);
    work.partials = partials.map(formatWhole);
    work.total = formatWhole(correct.answer);
    work.answer = formatNumber(given?.answer ?? correct.answer, language);
  }
  return work;
}

/** A saved working of this task: only strings, the right number of rows; anything else starts empty. */
export function ownWork(task: Task, raw: unknown, chunks = DEFAULT_CHUNKS): Work {
  const start = startWork(task, chunks);
  const w = (raw ?? {}) as Partial<Work>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const savedChunks = Array.isArray(w.chunks) ? w.chunks.slice(0, MAX_CHUNKS) : [];
  return {
    chunks: savedChunks.length
      ? savedChunks.map((c) => ({ bite: text(c?.bite), factor: text(c?.factor), rest: text(c?.rest) }))
      : start.chunks,
    factorTotal: text(w.factorTotal),
    partials: start.partials.map((_, i) => text(Array.isArray(w.partials) ? w.partials[i] : "")),
    total: text(w.total),
    answer: text(w.answer),
    remainder: text(w.remainder),
  };
}

/** Whether a box holds text that is not a number (marked, and the answer then makes the PCI invalid). */
export const notANumber = (text: string, language = "en") => !blank(text) && parseNumber(text, language) === null;
