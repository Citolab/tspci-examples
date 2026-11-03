// The formulas of the spreadsheet: a tokenizer, a parser and an evaluator for a part of what Excel does, instead of
// eval. Inputs are stored the English way (1.5, =SUM(A1,B1)), so a response does not depend on the language;
// localize() and canonical() convert for a Dutch candidate (1,5, =SOM(A1;B1)). No imports: `npm test` runs it in node.

export type Locale = { decimal: "." | ","; separator: "," | ";"; true: string; false: string };
export const EN: Locale = { decimal: ".", separator: ",", true: "TRUE", false: "FALSE" };
export const NL: Locale = { decimal: ",", separator: ";", true: "WAAR", false: "ONWAAR" };
export const localeFor = (language: string): Locale => ((language ?? "").slice(0, 2).toLowerCase() === "nl" ? NL : EN);

export class CellError {
  code: string;
  constructor(code: string) {
    this.code = code;
  }
}
/** What a cell holds after evaluation; null is an empty cell. */
export type Value = number | string | boolean | null | CellError;
const isError = (v: unknown): v is CellError => v instanceof CellError;

// --- coordinates: A1 is row 0, column 0

export const MAX_COLUMNS = 26;
export const MAX_ROWS = 100;
/** 0 → A, 25 → Z, 26 → AA. */
export const columnName = (col: number): string => (col < 26 ? "" : columnName(Math.floor(col / 26) - 1)) + String.fromCharCode(65 + (col % 26));
export const refName = (row: number, col: number) => `${columnName(col)}${row + 1}`;
export const parseRef = (ref: string): { row: number; col: number } | null => {
  const m = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref ?? "");
  if (!m) return null;
  const col = m[1].split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(m[2]) - 1, col };
};

// --- tokens

type RefParts = { row: number; col: number; rowAbs: boolean; colAbs: boolean };
type Token = { t: "num" | "str" | "ref" | "name" | "op" | "(" | ")" | "sep" | ":" | "err"; v?: any; ref?: RefParts; start: number; end: number };

const REF = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)/;
const NAME = /^[A-Za-z_][A-Za-z0-9_.]*/;
const NUMBER = { ".": /^(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?/, ",": /^(\d+([.,]\d+)?|[.,]\d+)([eE][-+]?\d+)?/ };

/** The tokens of a formula (without its =); throws a SyntaxError for what is not a formula. */
export const tokenize = (text: string, locale: Locale): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const c = text[i];
    let m: RegExpExecArray | null;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ((m = NUMBER[locale.decimal].exec(rest))) {
      tokens.push({ t: "num", v: Number(m[0].replace(",", ".")), start: i, end: i + m[0].length });
    } else if (c === '"') {
      let j = i + 1;
      let s = "";
      for (;;) {
        if (j >= text.length) throw new SyntaxError("unclosed string");
        if (text[j] === '"') {
          if (text[j + 1] !== '"') break;
          j++;
        }
        s += text[j++];
      }
      tokens.push({ t: "str", v: s, start: i, end: j + 1 });
    } else if ((m = REF.exec(rest)) && !/^[A-Za-z0-9_.(]/.test(rest.slice(m[0].length))) {
      const col = m[2].toUpperCase().split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const ref = { col, row: Number(m[4]) - 1, colAbs: m[1] === "$", rowAbs: m[3] === "$" };
      tokens.push({ t: "ref", ref, start: i, end: i + m[0].length });
    } else if ((m = NAME.exec(rest))) {
      tokens.push({ t: "name", v: m[0].toUpperCase(), start: i, end: i + m[0].length });
    } else if (rest.startsWith("#REF!")) {
      tokens.push({ t: "err", v: "#REF!", start: i, end: i + 5 });
    } else if ((m = /^(<>|<=|>=|[-+*/^&=<>%])/.exec(rest))) {
      tokens.push({ t: "op", v: m[0], start: i, end: i + m[0].length });
    } else if (c === "(" || c === ")" || c === ":") {
      tokens.push({ t: c, start: i, end: i + 1 });
    } else if (c === "," || c === ";") {
      tokens.push({ t: "sep", start: i, end: i + 1 });
    } else {
      throw new SyntaxError(`unexpected ${c}`);
    }
    i = tokens[tokens.length - 1].end;
  }
  return tokens;
};

// --- parser: comparison < & < + - < * / < ^ < unary - < % (as Excel: -2^2 is 4)

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "err"; code: string }
  | { k: "ref"; ref: RefParts }
  | { k: "range"; from: RefParts; to: RefParts }
  | { k: "call"; name: string; args: Node[] }
  | { k: "un"; op: string; a: Node }
  | { k: "pct"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node };

const parse = (formula: string): Node => {
  const tokens = tokenize(formula, EN);
  let pos = 0;
  const peek = () => tokens[pos];
  const op = (...ops: string[]): string | null => (peek()?.t === "op" && ops.includes(peek().v) ? tokens[pos++].v : null);
  const expect = (t: Token["t"]) => {
    if (peek()?.t !== t) throw new SyntaxError(`expected ${t}`);
    pos++;
  };
  const binary = (next: () => Node, ...ops: string[]) => (): Node => {
    let a = next();
    let o: string | null;
    while ((o = op(...ops))) a = { k: "bin", op: o, a, b: next() };
    return a;
  };
  const primary = (): Node => {
    const t = tokens[pos++];
    if (!t) throw new SyntaxError("unexpected end");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "err") return { k: "err", code: t.v };
    if (t.t === "ref") {
      if (peek()?.t !== ":") return { k: "ref", ref: t.ref };
      pos++;
      const to = tokens[pos++];
      if (to?.t !== "ref") throw new SyntaxError("expected a cell");
      return { k: "range", from: t.ref, to: to.ref };
    }
    if (t.t === "name") {
      if (peek()?.t === "(") {
        pos++;
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(comparison());
          while (peek()?.t === "sep") {
            pos++;
            args.push(comparison());
          }
        }
        expect(")");
        return { k: "call", name: t.v, args };
      }
      if (t.v === "TRUE" || t.v === "WAAR") return { k: "bool", v: true };
      if (t.v === "FALSE" || t.v === "ONWAAR") return { k: "bool", v: false };
      return { k: "err", code: "#NAME?" };
    }
    if (t.t === "(") {
      const e = comparison();
      expect(")");
      return e;
    }
    throw new SyntaxError(`unexpected ${t.t}`);
  };
  const postfix = (): Node => {
    let a = primary();
    while (op("%")) a = { k: "pct", a };
    return a;
  };
  const unary = (): Node => {
    const o = op("-", "+");
    return o ? { k: "un", op: o, a: unary() } : postfix();
  };
  const power = binary(unary, "^");
  const product = binary(power, "*", "/");
  const sum = binary(product, "+", "-");
  const concat = binary(sum, "&");
  const comparison = binary(concat, "=", "<>", "<", ">", "<=", ">=");

  const node = comparison();
  if (pos < tokens.length) throw new SyntaxError("unexpected rest");
  return node;
};

// --- values

/** 1.5, -2, .5, 1e3 and 15% (0.15), the English way; null for anything else. */
export const literalNumber = (text: string): number | null => {
  const m = /^([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?)(%?)$/.exec(text);
  return m ? Number(m[1]) / (m[2] ? 100 : 1) : null;
};

/** A cell's input that is not a formula: a number, TRUE or FALSE, or text ('15 is the text 15). */
export const literal = (input: string): Value => {
  if (input === "") return null;
  if (input.startsWith("'")) return input.slice(1);
  const n = literalNumber(input.trim());
  if (n !== null) return n;
  const upper = input.trim().toUpperCase();
  if (upper === "TRUE" || upper === "WAAR") return true;
  if (upper === "FALSE" || upper === "ONWAAR") return false;
  return input;
};

/** Ten significant digits, as Excel shows them: 0.1 + 0.2 is 0.3. */
export const formatNumber = (n: number, locale: Locale) => {
  const s = String(Number(n.toPrecision(10)));
  return locale.decimal === "," ? s.replace(".", ",") : s;
};

/** What the cell shows. */
export const display = (v: Value, locale: Locale): string =>
  v === null ? "" : isError(v) ? v.code : typeof v === "number" ? formatNumber(v, locale) : typeof v === "boolean" ? (v ? locale.true : locale.false) : v;

/** A value as the response reports it, the same in every language (15.1, TRUE); null for an empty cell. */
export const responseText = (v: Value): string | null => {
  const s = display(v, EN).trim();
  return s === "" ? null : s;
};

const toNumber = (v: Value): number | CellError => {
  if (isError(v)) return v;
  if (v === null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = literalNumber(v.trim());
  return n === null ? new CellError("#VALUE!") : n;
};
const toText = (v: Value, locale: Locale) => display(v, locale);
const finite = (n: number): Value => (Number.isFinite(n) ? n : new CellError("#NUM!"));

/** Numbers before text before booleans, text without case, an empty cell as the other side's kind of value. */
const compare = (a: Value, b: Value, op: string): boolean => {
  const empty = (other: Value) => (typeof other === "number" ? 0 : typeof other === "boolean" ? false : "");
  const x = a ?? empty(b);
  const y = b ?? empty(a);
  const rank = (v: Value) => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);
  const d =
    rank(x) !== rank(y)
      ? rank(x) - rank(y)
      : typeof x === "string"
        ? x.toLowerCase().localeCompare((y as string).toLowerCase())
        : Number(x) - Number(y);
  switch (op) {
    case "=": return d === 0;
    case "<>": return d !== 0;
    case "<": return d < 0;
    case ">": return d > 0;
    case "<=": return d <= 0;
    default: return d >= 0;
  }
};

// --- evaluation

type Result = Value | Value[];
type Lookup = (row: number, col: number) => Value;
type Fn = (args: Node[], ev: (n: Node) => Result, locale: Locale) => Value;

const evaluate = (node: Node, get: Lookup, locale: Locale): Result => {
  const scalar = (n: Node): Value => {
    const r = evaluate(n, get, locale);
    return Array.isArray(r) ? (r.length === 1 ? r[0] : new CellError("#VALUE!")) : r;
  };
  switch (node.k) {
    case "num":
    case "str":
    case "bool":
      return node.v;
    case "err":
      return new CellError(node.code);
    case "ref":
      return get(node.ref.row, node.ref.col);
    case "range": {
      const [r1, r2] = [node.from.row, node.to.row].sort((a, b) => a - b);
      const [c1, c2] = [node.from.col, node.to.col].sort((a, b) => a - b);
      if (r2 >= MAX_ROWS || c2 >= MAX_COLUMNS) return new CellError("#REF!");
      const cells: Value[] = [];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cells.push(get(r, c));
      return cells;
    }
    case "un": {
      const v = toNumber(scalar(node.a));
      return isError(v) ? v : node.op === "-" ? -v : v;
    }
    case "pct": {
      const v = toNumber(scalar(node.a));
      return isError(v) ? v : v / 100;
    }
    case "bin": {
      const a = scalar(node.a);
      const b = scalar(node.b);
      if (isError(a)) return a;
      if (isError(b)) return b;
      if (node.op === "&") return toText(a, locale) + toText(b, locale);
      if (["=", "<>", "<", ">", "<=", ">="].includes(node.op)) return compare(a, b, node.op);
      const x = toNumber(a);
      const y = toNumber(b);
      if (isError(x)) return x;
      if (isError(y)) return y;
      switch (node.op) {
        case "+": return finite(x + y);
        case "-": return finite(x - y);
        case "*": return finite(x * y);
        case "/": return y === 0 ? new CellError("#DIV/0!") : finite(x / y);
        default: return finite(Math.pow(x, y));
      }
    }
    case "call": {
      const f = FUNCTIONS[ALIASES[node.name] ?? node.name];
      return f ? f(node.args, (n) => evaluate(n, get, locale), locale) : new CellError("#NAME?");
    }
  }
};

// --- functions

/** A reference or range as its cells, anything else as one value. */
const cellsOf = (n: Node, ev: (n: Node) => Result): Value[] => {
  const r = ev(n);
  return Array.isArray(r) ? r : [r];
};
const isReference = (n: Node) => n.k === "ref" || n.k === "range";

/** The numbers of the arguments: from a reference only its numbers (as Excel), anything else as a number. */
const numbers = (args: Node[], ev: (n: Node) => Result): number[] | CellError => {
  const out: number[] = [];
  for (const a of args) {
    if (isReference(a)) {
      for (const v of cellsOf(a, ev)) {
        if (isError(v)) return v;
        if (typeof v === "number") out.push(v);
      }
    } else {
      const n = toNumber(cellsOf(a, ev)[0]);
      if (isError(n)) return n;
      out.push(n);
    }
  }
  return out;
};
const ofNumbers = (f: (ns: number[]) => Value): Fn => (args, ev) => {
  const ns = numbers(args, ev);
  return isError(ns) ? ns : f(ns);
};
/** A function of `min` to `max` numbers. */
const math = (min: number, max: number, f: (...xs: number[]) => Value): Fn => (args, ev) => {
  if (args.length < min || args.length > max) return new CellError("#VALUE!");
  const xs: number[] = [];
  for (const a of args) {
    const r = ev(a);
    const n = toNumber(Array.isArray(r) ? (r.length === 1 ? r[0] : new CellError("#VALUE!")) : r);
    if (isError(n)) return n;
    xs.push(n);
  }
  return f(...xs);
};
const truth = (v: Value): boolean | CellError => {
  if (isError(v)) return v;
  if (typeof v === "boolean") return v;
  if (v === null) return false;
  if (typeof v === "number") return v !== 0;
  const upper = v.toUpperCase();
  return upper === "TRUE" || upper === "WAAR" ? true : upper === "FALSE" || upper === "ONWAAR" ? false : new CellError("#VALUE!");
};
const logical = (f: (bs: boolean[]) => boolean): Fn => (args, ev) => {
  const bs: boolean[] = [];
  for (const a of args) {
    for (const v of cellsOf(a, ev)) {
      if (isReference(a) && (v === null || typeof v === "string")) continue;
      const b = truth(v);
      if (isError(b)) return b;
      bs.push(b);
    }
  }
  return bs.length ? f(bs) : new CellError("#VALUE!");
};
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
/** Half away from zero, as Excel: ROUND(2.675, 2) is 2.68. */
const rounding = (how: (x: number) => number) => (x: number, digits = 0) => {
  const p = Math.pow(10, Math.trunc(digits));
  return finite((Math.sign(x) * how(Number((Math.abs(x) * p).toPrecision(15)))) / p);
};

/** COUNTIF and SUMIF: 5, "5", ">5", "<>apples", "=apples" or "apples" (without case). */
const criterion = (c: Value, locale: Locale) => {
  if (typeof c !== "string") return (v: Value) => v !== null && !isError(v) && typeof v === typeof c && compare(v, c, "=");
  const [, op = "=", operand] = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(c);
  const n = literalNumber(operand.trim().replace(locale.decimal, "."));
  const target: Value = n ?? (operand === "" ? null : operand);
  return (v: Value) => {
    if (isError(v)) return false;
    if (target === null) return op === "<>" ? v !== null && v !== "" : v === null || v === "";
    if (v === null || typeof v !== typeof target) return op === "<>";
    return compare(v, target, op);
  };
};

const FUNCTIONS: Record<string, Fn> = {
  SUM: ofNumbers(sum),
  AVERAGE: ofNumbers((ns) => (ns.length ? sum(ns) / ns.length : new CellError("#DIV/0!"))),
  MIN: ofNumbers((ns) => (ns.length ? Math.min(...ns) : 0)),
  MAX: ofNumbers((ns) => (ns.length ? Math.max(...ns) : 0)),
  PRODUCT: ofNumbers((ns) => finite(ns.reduce((a, b) => a * b, 1))),
  MEDIAN: ofNumbers((ns) => {
    if (!ns.length) return new CellError("#NUM!");
    const s = [...ns].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }),
  COUNT: (args, ev) =>
    args.reduce((n, a) => n + cellsOf(a, ev).filter((v) => typeof v === "number" || (!isReference(a) && !isError(toNumber(v)))).length, 0),
  COUNTA: (args, ev) => args.reduce((n, a) => n + cellsOf(a, ev).filter((v) => v !== null && v !== "").length, 0),
  ROUND: math(1, 2, rounding(Math.round)),
  ROUNDUP: math(1, 2, rounding(Math.ceil)),
  ROUNDDOWN: math(1, 2, rounding(Math.floor)),
  INT: math(1, 1, Math.floor),
  ABS: math(1, 1, Math.abs),
  SQRT: math(1, 1, (x) => (x < 0 ? new CellError("#NUM!") : Math.sqrt(x))),
  POWER: math(2, 2, (x, y) => finite(Math.pow(x, y))),
  MOD: math(2, 2, (x, y) => (y === 0 ? new CellError("#DIV/0!") : x - y * Math.floor(x / y))),
  PI: math(0, 0, () => Math.PI),
  IF: (args, ev) => {
    if (args.length < 2 || args.length > 3) return new CellError("#VALUE!");
    const c = truth(cellsOf(args[0], ev)[0]);
    if (isError(c)) return c;
    const branch = c ? args[1] : args[2];
    if (!branch) return false;
    const r = ev(branch);
    return Array.isArray(r) ? (r.length === 1 ? r[0] : new CellError("#VALUE!")) : r;
  },
  AND: logical((bs) => bs.every(Boolean)),
  OR: logical((bs) => bs.some(Boolean)),
  NOT: (args, ev) => {
    if (args.length !== 1) return new CellError("#VALUE!");
    const b = truth(cellsOf(args[0], ev)[0]);
    return isError(b) ? b : !b;
  },
  COUNTIF: (args, ev, locale) => {
    if (args.length !== 2) return new CellError("#VALUE!");
    const matches = criterion(cellsOf(args[1], ev)[0], locale);
    return cellsOf(args[0], ev).filter(matches).length;
  },
  SUMIF: (args, ev, locale) => {
    if (args.length < 2 || args.length > 3) return new CellError("#VALUE!");
    const matches = criterion(cellsOf(args[1], ev)[0], locale);
    const range = cellsOf(args[0], ev);
    const values = args[2] ? cellsOf(args[2], ev) : range;
    return range.reduce<number>((total, v, i) => (matches(v) && typeof values[i] === "number" ? total + (values[i] as number) : total), 0);
  },
};

/** The Dutch names of the functions (Excel in Dutch); MIN, MAX, PRODUCT, ABS and PI are the same. */
const ALIASES: Record<string, string> = {
  SOM: "SUM", GEMIDDELDE: "AVERAGE", AANTAL: "COUNT", AANTALARG: "COUNTA", MEDIAAN: "MEDIAN", PRODUCT: "PRODUCT",
  AFRONDEN: "ROUND", "AFRONDEN.NAAR.BOVEN": "ROUNDUP", "AFRONDEN.NAAR.BENEDEN": "ROUNDDOWN", INTEGER: "INT",
  WORTEL: "SQRT", MACHT: "POWER", REST: "MOD", ALS: "IF", EN: "AND", OF: "OR", NIET: "NOT",
  "AANTAL.ALS": "COUNTIF", "SOM.ALS": "SUMIF",
};
/** For the help text: every function by its name in this language. */
export const functionNames = (locale: Locale) => {
  const dutch = Object.fromEntries(Object.entries(ALIASES).map(([nl, en]) => [en, nl]));
  return Object.keys(FUNCTIONS).map((name) => (locale === NL ? dutch[name] ?? name : name));
};

// --- the sheet

const parsed = new Map<string, Node | SyntaxError>();
const parseCached = (formula: string): Node | SyntaxError => {
  if (!parsed.has(formula)) {
    try {
      parsed.set(formula, parse(formula));
    } catch (e) {
      parsed.set(formula, e instanceof SyntaxError ? e : new SyntaxError(String(e)));
    }
  }
  return parsed.get(formula);
};

const compute = (input: string, get: Lookup, locale: Locale): Value => {
  if (!input.startsWith("=") || input.length === 1) return literal(input);
  const node = parseCached(input.slice(1));
  if (node instanceof SyntaxError) return new CellError("#ERROR!");
  const r = evaluate(node, get, locale);
  const v = Array.isArray(r) ? (r.length === 1 ? r[0] : new CellError("#VALUE!")) : r;
  return v === null ? 0 : v; // =A1 of an empty A1 is 0, as in Excel
};

/** The value of every cell with an input (canonical inputs by A1 name); a cell in a loop is #CIRC!. */
export const evaluateSheet = (inputs: Record<string, string>, size: { columns: number; rows: number }, locale: Locale) => {
  const values = new Map<string, Value>();
  const busy = new Set<string>();
  const get = (row: number, col: number): Value => {
    if (row < 0 || col < 0 || row >= size.rows || col >= size.columns) return new CellError("#REF!");
    const ref = refName(row, col);
    if (values.has(ref)) return values.get(ref);
    if (busy.has(ref)) return new CellError("#CIRC!");
    busy.add(ref);
    const v = compute(inputs[ref] ?? "", get, locale);
    busy.delete(ref);
    values.set(ref, v);
    return v;
  };
  for (const ref of Object.keys(inputs)) {
    const p = parseRef(ref);
    if (p) get(p.row, p.col);
  }
  return values;
};

// --- rewriting inputs

/** Rewrites the tokens of a formula; what is between them (spaces) stays. */
const rewrite = (input: string, locale: Locale, f: (t: Token, raw: string) => string): string => {
  let tokens: Token[];
  try {
    tokens = tokenize(input.slice(1), locale);
  } catch {
    return input;
  }
  let out = "=";
  let at = 1;
  for (const t of tokens) {
    out += input.slice(at, t.start + 1) + f(t, input.slice(t.start + 1, t.end + 1));
    at = t.end + 1;
  }
  return out + input.slice(at);
};

const convert = (input: string, from: Locale, to: Locale): string => {
  if (from === to) return input;
  if (input.startsWith("=")) return rewrite(input, from, (t, raw) => (t.t === "num" ? raw.replace(from.decimal, to.decimal) : t.t === "sep" ? to.separator : raw));
  const trimmed = input.trim();
  if (from === NL && /^[-+]?(\d+(,\d+)?|,\d+)%?$/.test(trimmed)) return trimmed.replace(",", ".");
  if (to === NL && literalNumber(trimmed) !== null) return trimmed.replace(".", ",");
  return input;
};
/** A stored input as the candidate reads and edits it: 1,5 and =SOM(A1;B1) in Dutch. */
export const localize = (input: string, locale: Locale) => convert(input, EN, locale);
/** What the candidate typed, as it is stored (English). */
export const canonical = (text: string, locale: Locale) => convert(text, locale, EN);

/** A formula copied `rows` down and `cols` to the right: A1 moves along, $A$1 stays (as Excel's fill and paste). */
export const shift = (input: string, rows: number, cols: number): string =>
  !input.startsWith("=")
    ? input
    : rewrite(input, EN, (t, raw) => {
        if (t.t !== "ref") return raw;
        const row = t.ref.row + (t.ref.rowAbs ? 0 : rows);
        const col = t.ref.col + (t.ref.colAbs ? 0 : cols);
        return row < 0 || col < 0 ? "#REF!" : `${t.ref.colAbs ? "$" : ""}${columnName(col)}${t.ref.rowAbs ? "$" : ""}${row + 1}`;
      });
