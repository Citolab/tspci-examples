// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The block language and its interpreter. The original attached JavaScript to every block and ran it with new Function
// in a Worker; this PCI never runs code that an author or a candidate wrote. A program is a tree of a few kinds of
// statement (set, input, print, if, if/else, while, repeat, for) with small expressions (numbers, text, variables,
// arithmetic, comparisons, and/or/not, a few functions), parsed and evaluated here, with a limit on the steps.
// No imports: `npm test` runs it in node.

export type Language = "en" | "nl" | "fr";

/** "nl", "nl-NL", "FR" → nl, fr; anything else en. */
export const languageOf = (language: unknown): Language => {
  const code = String(language ?? "").slice(0, 2).toLowerCase();
  return code === "nl" || code === "fr" ? code : "en";
};

export type Value = number | string | boolean;

/** What can go wrong, with the line of the program (1-based; 0: the program as a whole) and details for the message. */
export type ErrorCode =
  | "empty" // the program has no blocks
  | "blank" // a blank is not filled in
  | "syntax" // an expression cannot be read
  | "notName" // a variable blank holds something that is not a name
  | "undefined" // a variable without a value
  | "notNumber" // arithmetic or a count with something that is not a number
  | "notBoolean" // a condition, and/or/not with something that is not true/false
  | "notComparable" // < > with a number and a text
  | "divZero"
  | "noInput" // input when every input value has been read
  | "notWhole" // repeat with a count that is not a whole number ≥ 0
  | "unknownFunction"
  | "arguments" // a function with the wrong number or kind of arguments
  | "tooManySteps"
  | "tooMuchOutput"
  | "tooDeep"; // more levels of nesting than allowed

export type RunError = { code: ErrorCode; line: number; detail?: string };

class Failure extends Error {
  code: ErrorCode;
  detail?: string;
  line: number;
  constructor(code: ErrorCode, detail?: string, line = 0) {
    super(code);
    this.code = code;
    this.detail = detail;
    this.line = line;
  }
}

// ─── words per language ──────────────────────────────────────────────────────────────────────────────────────────────

type Words = { and: string[]; or: string[]; not: string[]; true: string[]; false: string[]; mod: string[]; div: string[] };

const WORDS: Record<Language, Words> = {
  en: { and: ["and"], or: ["or"], not: ["not"], true: ["true"], false: ["false"], mod: ["mod"], div: ["div"] },
  nl: { and: ["and", "en"], or: ["or", "of"], not: ["not", "niet"], true: ["true", "waar"], false: ["false", "onwaar"], mod: ["mod"], div: ["div"] },
  fr: { and: ["and", "et"], or: ["or", "ou"], not: ["not", "non"], true: ["true", "vrai"], false: ["false", "faux"], mod: ["mod"], div: ["div"] },
};

/** How a program prints true and false. */
export const BOOLEAN_WORDS: Record<Language, [string, string]> = { en: ["true", "false"], nl: ["waar", "onwaar"], fr: ["vrai", "faux"] };

type Fn = { min: number; max: number; call: (args: Value[]) => Value };
const num = (v: Value): number => {
  if (typeof v !== "number") throw new Failure("arguments");
  return v;
};
const FUNCTIONS: Record<string, Fn> = {
  abs: { min: 1, max: 1, call: ([a]) => Math.abs(num(a)) },
  round: { min: 1, max: 1, call: ([a]) => Math.round(num(a)) },
  floor: { min: 1, max: 1, call: ([a]) => Math.floor(num(a)) },
  ceil: { min: 1, max: 1, call: ([a]) => Math.ceil(num(a)) },
  sqrt: {
    min: 1, max: 1, call: ([a]) => {
      if (num(a) < 0) throw new Failure("arguments");
      return Math.sqrt(num(a));
    },
  },
  min: { min: 1, max: 10, call: (args) => Math.min(...args.map(num)) },
  max: { min: 1, max: 10, call: (args) => Math.max(...args.map(num)) },
  length: {
    min: 1, max: 1, call: ([a]) => {
      if (typeof a !== "string") throw new Failure("arguments");
      return [...a].length;
    },
  },
};
const FUNCTION_ALIASES: Record<string, string> = {
  len: "length", lengte: "length", longueur: "length",
  afronden: "round", arrondi: "round", wortel: "sqrt", racine: "sqrt",
};
/** The functions an expression may call, by every name it accepts. */
export const FUNCTION_NAMES = [...Object.keys(FUNCTIONS), ...Object.keys(FUNCTION_ALIASES)];

// ─── tokens ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type Token =
  | { t: "num"; v: number; at: string }
  | { t: "str"; v: string; at: string }
  | { t: "name"; v: string; at: string }
  | { t: "op"; v: string; at: string };

const OPERATORS = ["**", "//", "==", "!=", "<>", "<=", ">=", "≤", "≥", "≠", "&&", "||", "+", "-", "−", "*", "×", "/", "÷", "%", "^", "=", "<", ">", "(", ")", ",", "!"];
const NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** A variable name: a letter or _, then letters, digits or _; not a word of the language. */
export const isName = (text: string, language: Language = "en"): boolean => {
  if (!NAME.test(text)) return false;
  const w = WORDS[language];
  const reserved = [...w.and, ...w.or, ...w.not, ...w.true, ...w.false, ...w.mod, ...w.div];
  return !reserved.includes(text.toLowerCase());
};

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const rest = source.slice(i);
    const number = /^(\d+(\.\d+)?|\.\d+)/.exec(rest);
    if (number) {
      tokens.push({ t: "num", v: parseFloat(number[0]), at: number[0] });
      i += number[0].length;
      continue;
    }
    const quote = { '"': '"', "'": "'", "“": "”", "‘": "’", "„": "”", "«": "»" }[c];
    if (quote) {
      const end = source.indexOf(quote, i + 1);
      const alt = c === "“" || c === "„" ? source.indexOf('"', i + 1) : -1; // a curly quote closed with a straight one
      const close = end >= 0 ? end : alt;
      if (close < 0) throw new Failure("syntax", rest);
      tokens.push({ t: "str", v: source.slice(i + 1, close), at: source.slice(i, close + 1) });
      i = close + 1;
      continue;
    }
    const name = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(rest);
    if (name) {
      tokens.push({ t: "name", v: name[0], at: name[0] });
      i += name[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (!op) throw new Failure("syntax", c);
    tokens.push({ t: "op", v: op, at: op });
    i += op.length;
  }
  return tokens;
};

// ─── expressions ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type Expr =
  | { k: "lit"; v: Value }
  | { k: "var"; name: string }
  | { k: "call"; fn: string; args: Expr[] }
  | { k: "un"; op: "-" | "not"; a: Expr }
  | { k: "bin"; op: string; a: Expr; b: Expr };

const CANONICAL_OP: Record<string, string> = {
  "==": "=", "<>": "!=", "≠": "!=", "≤": "<=", "≥": ">=", "−": "-", "×": "*", "÷": "/", "**": "^", "&&": "and", "||": "or",
  "!": "not",
};

/** Parses an expression; a list of expressions separated by commas when list is true (print). Throws a Failure. */
export const parseExpression = (source: string, language: Language = "en", list = false): Expr[] => {
  const tokens = tokenize(source);
  const words = WORDS[language];
  let p = 0;
  const peek = () => tokens[p];
  const near = () => (p < tokens.length ? tokens.slice(p).map((t) => t.at).join(" ") : source.trim());
  const fail = (): never => {
    throw new Failure("syntax", near());
  };
  /** The operator at p, in its canonical form (a word such as "en" as "and"), or null. */
  const opAt = (): string | null => {
    const t = peek();
    if (!t) return null;
    if (t.t === "op") return CANONICAL_OP[t.v] ?? t.v;
    if (t.t === "name") {
      const w = t.v.toLowerCase();
      for (const key of ["and", "or", "not", "mod", "div"] as const) if (words[key].includes(w)) return key;
    }
    return null;
  };
  const take = (...ops: string[]): string | null => {
    const op = opAt();
    if (op && ops.includes(op)) {
      p++;
      return op;
    }
    return null;
  };

  const or = (): Expr => {
    let a = and();
    while (take("or")) a = { k: "bin", op: "or", a, b: and() };
    return a;
  };
  const and = (): Expr => {
    let a = not();
    while (take("and")) a = { k: "bin", op: "and", a, b: not() };
    return a;
  };
  const not = (): Expr => (take("not") ? { k: "un", op: "not", a: not() } : compare());
  const compare = (): Expr => {
    const a = add();
    const op = take("=", "!=", "<", "<=", ">", ">=");
    return op ? { k: "bin", op, a, b: add() } : a;
  };
  const add = (): Expr => {
    let a = mul();
    for (let op = take("+", "-"); op; op = take("+", "-")) a = { k: "bin", op, a, b: mul() };
    return a;
  };
  const mul = (): Expr => {
    let a = unary();
    for (let op = take("*", "/", "%", "//", "mod", "div"); op; op = take("*", "/", "%", "//", "mod", "div")) {
      a = { k: "bin", op: op === "mod" ? "%" : op === "div" ? "//" : op, a, b: unary() };
    }
    return a;
  };
  const unary = (): Expr => {
    if (take("-")) return { k: "un", op: "-", a: unary() };
    if (take("+")) return unary();
    return power();
  };
  const power = (): Expr => {
    const a = primary();
    return take("^") ? { k: "bin", op: "^", a, b: unary() } : a;
  };
  const primary = (): Expr => {
    const t = peek();
    if (!t) return fail();
    if (t.t === "num") {
      p++;
      return { k: "lit", v: t.v };
    }
    if (t.t === "str") {
      p++;
      return { k: "lit", v: t.v };
    }
    if (t.t === "op" && t.v === "(") {
      p++;
      const e = or();
      if (!take(")")) fail();
      return e;
    }
    if (t.t === "name") {
      const lower = t.v.toLowerCase();
      if (words.true.includes(lower)) {
        p++;
        return { k: "lit", v: true };
      }
      if (words.false.includes(lower)) {
        p++;
        return { k: "lit", v: false };
      }
      if (opAt()) return fail(); // and, or, not … where a value belongs
      p++;
      if (tokens[p]?.t === "op" && tokens[p].v === "(") {
        p++;
        const args: Expr[] = [];
        if (!take(")")) {
          do args.push(or()); while (take(","));
          if (!take(")")) fail();
        }
        return { k: "call", fn: t.v, args };
      }
      return { k: "var", name: t.v };
    }
    return fail();
  };

  if (!tokens.length) throw new Failure("syntax", "");
  const result = [or()];
  if (list) while (take(",")) result.push(or());
  if (p < tokens.length) fail();
  return result;
};

export type Scope = Map<string, Value>;

const isNum = (v: Value): v is number => typeof v === "number";

/** Rounds away floating point noise: 0.1 + 0.2 → 0.3. */
export const clean = (value: number): number => (isFinite(value) ? parseFloat(value.toPrecision(12)) : value);

export const evaluate = (e: Expr, scope: Scope, language: Language = "en"): Value => {
  switch (e.k) {
    case "lit":
      return e.v;
    case "var": {
      if (!scope.has(e.name)) throw new Failure("undefined", e.name);
      return scope.get(e.name)!;
    }
    case "call": {
      const name = FUNCTION_ALIASES[e.fn.toLowerCase()] ?? e.fn.toLowerCase();
      const fn = FUNCTIONS[name];
      if (!fn) throw new Failure("unknownFunction", e.fn);
      if (e.args.length < fn.min || e.args.length > fn.max) throw new Failure("arguments", e.fn);
      const args = e.args.map((a) => evaluate(a, scope, language));
      try {
        return clean(fn.call(args) as number);
      } catch (error) {
        if (error instanceof Failure) throw new Failure(error.code, e.fn);
        throw error;
      }
    }
    case "un": {
      const a = evaluate(e.a, scope, language);
      if (e.op === "-") {
        if (!isNum(a)) throw new Failure("notNumber", "-");
        return clean(-a);
      }
      if (typeof a !== "boolean") throw new Failure("notBoolean", "not");
      return !a;
    }
    case "bin": {
      if (e.op === "and" || e.op === "or") {
        const a = evaluate(e.a, scope, language);
        if (typeof a !== "boolean") throw new Failure("notBoolean", e.op);
        if (e.op === "and" ? !a : a) return a; // short circuit
        const b = evaluate(e.b, scope, language);
        if (typeof b !== "boolean") throw new Failure("notBoolean", e.op);
        return b;
      }
      const a = evaluate(e.a, scope, language);
      const b = evaluate(e.b, scope, language);
      switch (e.op) {
        case "=":
          return typeof a === typeof b && (isNum(a) ? clean(a) === clean(b as number) : a === b);
        case "!=":
          return !(typeof a === typeof b && (isNum(a) ? clean(a) === clean(b as number) : a === b));
        case "<":
        case "<=":
        case ">":
        case ">=": {
          if (!((isNum(a) && isNum(b)) || (typeof a === "string" && typeof b === "string"))) throw new Failure("notComparable", e.op);
          const x = isNum(a) ? clean(a) : a;
          const y = isNum(b) ? clean(b as number) : b;
          return e.op === "<" ? x < y : e.op === "<=" ? x <= y : e.op === ">" ? x > y : x >= y;
        }
        case "+":
          if (isNum(a) && isNum(b)) return clean(a + b);
          if (typeof a === "string" || typeof b === "string") return `${show(a, language)}${show(b, language)}`;
          throw new Failure("notNumber", "+");
      }
      if (!isNum(a) || !isNum(b)) throw new Failure("notNumber", e.op);
      switch (e.op) {
        case "-":
          return clean(a - b);
        case "*":
          return clean(a * b);
        case "/":
          if (b === 0) throw new Failure("divZero");
          return clean(a / b);
        case "//":
          if (b === 0) throw new Failure("divZero");
          return Math.floor(clean(a / b));
        case "%":
          if (b === 0) throw new Failure("divZero");
          return clean(((a % b) + b) % b);
        case "^":
          return clean(Math.pow(a, b));
      }
      throw new Failure("syntax", e.op);
    }
  }
};

/** A value as a program prints it: 0.30000000000000004 → "0.3", true → "true" (or "waar", "vrai"). */
export const show = (v: Value, language: Language = "en"): string => {
  if (typeof v === "boolean") return BOOLEAN_WORDS[language][v ? 0 : 1];
  if (typeof v === "number") {
    if (!isFinite(v)) return String(v);
    let text = String(clean(v));
    if (/e/i.test(text) && Math.abs(v) < 1e21) text = clean(v).toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
    return text === "-0" ? "0" : text;
  }
  return v;
};

/** A value the candidate or the author typed as input: a number when it reads as one (2.5 or 2,5), else the text. */
export const inputValue = (text: string): Value => {
  const t = text.trim();
  if (/^[-−]?(\d+([.,]\d+)?|[.,]\d+)$/.test(t)) return clean(parseFloat(t.replace("−", "-").replace(",", ".")));
  return t;
};

/** Input values, one per line; empty lines are skipped. */
export const parseInputs = (text: string): Value[] =>
  String(text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "").map(inputValue);

// ─── programs ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A statement, as the blocks produce it: the operands are the text of the blanks (null when a blank is empty), and
 * line is where the block starts in the listing (elseLine: where "else" is).
 */
export type Stmt =
  | { kind: "set"; line: number; name: string | null; expr: string | null }
  | { kind: "input"; line: number; name: string | null }
  | { kind: "print"; line: number; expr: string | null }
  | { kind: "if"; line: number; cond: string | null; body: Stmt[]; other?: Stmt[] }
  | { kind: "while"; line: number; cond: string | null; body: Stmt[] }
  | { kind: "repeat"; line: number; count: string | null; body: Stmt[] }
  | { kind: "for"; line: number; name: string | null; from: string | null; to: string | null; body: Stmt[] };

export type RunOptions = { language?: Language; maxSteps?: number; maxOutput?: number; maxDepth?: number };
export type RunResult = { output: string[]; error?: RunError; steps: number };

export const DEFAULT_MAX_STEPS = 10000;
export const DEFAULT_MAX_OUTPUT = 500;
export const DEFAULT_MAX_DEPTH = 5;

type Compiled =
  | { kind: "set"; line: number; name: string; expr: Expr }
  | { kind: "input"; line: number; name: string }
  | { kind: "print"; line: number; exprs: Expr[] }
  | { kind: "if"; line: number; cond: Expr; body: Compiled[]; other?: Compiled[] }
  | { kind: "while"; line: number; cond: Expr; body: Compiled[] }
  | { kind: "repeat"; line: number; count: Expr; body: Compiled[] }
  | { kind: "for"; line: number; name: string; from: Expr; to: Expr; body: Compiled[] };

/** Checks every block before the program runs: empty blanks, names, expressions, the nesting. Throws a Failure. */
const compile = (program: Stmt[], language: Language, maxDepth: number, depth = 0): Compiled[] =>
  program.map((s): Compiled => {
    const at = (fn: () => any) => {
      try {
        return fn();
      } catch (error) {
        if (error instanceof Failure) throw new Failure(error.code, error.detail, s.line);
        throw error;
      }
    };
    const filled = (text: string | null): string => {
      if (text === null || text.trim() === "") throw new Failure("blank", undefined, s.line);
      return text.trim();
    };
    const name = (text: string | null): string => {
      const n = filled(text);
      if (!isName(n, language)) throw new Failure("notName", n, s.line);
      return n;
    };
    const expr = (text: string | null): Expr => at(() => parseExpression(filled(text), language)[0]);
    const nested = (body: Stmt[]) => {
      if (depth + 1 > maxDepth) throw new Failure("tooDeep", String(maxDepth), s.line);
      return compile(body, language, maxDepth, depth + 1);
    };
    switch (s.kind) {
      case "set":
        return { kind: "set", line: s.line, name: name(s.name), expr: expr(s.expr) };
      case "input":
        return { kind: "input", line: s.line, name: name(s.name) };
      case "print":
        return { kind: "print", line: s.line, exprs: at(() => parseExpression(filled(s.expr), language, true)) };
      case "if":
        return { kind: "if", line: s.line, cond: expr(s.cond), body: nested(s.body), other: s.other ? nested(s.other) : undefined };
      case "while":
        return { kind: "while", line: s.line, cond: expr(s.cond), body: nested(s.body) };
      case "repeat":
        return { kind: "repeat", line: s.line, count: expr(s.count), body: nested(s.body) };
      case "for":
        return { kind: "for", line: s.line, name: name(s.name), from: expr(s.from), to: expr(s.to), body: nested(s.body) };
    }
  });

/**
 * Runs a program with these input values: what it printed, and the error that stopped it (with its line). It never
 * throws: a program that loops forever stops after maxSteps steps.
 */
export const run = (program: Stmt[], inputs: Value[] = [], options: RunOptions = {}): RunResult => {
  const language = options.language ?? "en";
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxOutput = options.maxOutput ?? DEFAULT_MAX_OUTPUT;
  const output: string[] = [];
  const scope: Scope = new Map();
  let steps = 0;
  let read = 0;
  const step = (line: number) => {
    if (++steps > maxSteps) throw new Failure("tooManySteps", String(maxSteps), line);
  };
  const condition = (e: Expr, line: number): boolean => {
    const v = evaluate(e, scope, language);
    if (typeof v !== "boolean") throw new Failure("notBoolean", show(v, language), line);
    return v;
  };
  const number = (e: Expr): number => {
    const v = evaluate(e, scope, language);
    if (typeof v !== "number") throw new Failure("notNumber", show(v, language));
    return v;
  };
  const exec = (list: Compiled[]) => {
    for (const s of list) {
      step(s.line);
      try {
        switch (s.kind) {
          case "set":
            scope.set(s.name, evaluate(s.expr, scope, language));
            break;
          case "input":
            if (read >= inputs.length) throw new Failure("noInput");
            scope.set(s.name, inputs[read++]);
            break;
          case "print":
            if (output.length >= maxOutput) throw new Failure("tooMuchOutput", String(maxOutput));
            output.push(s.exprs.map((e) => show(evaluate(e, scope, language), language)).join(" "));
            break;
          case "if":
            if (condition(s.cond, s.line)) exec(s.body);
            else if (s.other) exec(s.other);
            break;
          case "while":
            while (condition(s.cond, s.line)) {
              exec(s.body);
              step(s.line);
            }
            break;
          case "repeat": {
            const n = number(s.count);
            if (!Number.isInteger(n) || n < 0) throw new Failure("notWhole", show(n, language));
            for (let i = 0; i < n; i++) {
              exec(s.body);
              step(s.line);
            }
            break;
          }
          case "for": {
            const from = number(s.from);
            const to = number(s.to);
            // "for i from 1 to 0" does not run (as in Pascal); counting down is a while loop
            for (let i = from; i <= to; i = clean(i + 1)) {
              scope.set(s.name, i);
              exec(s.body);
              step(s.line);
            }
            break;
          }
        }
      } catch (error) {
        if (error instanceof Failure && !error.line) error.line = s.line;
        throw error;
      }
    }
  };
  try {
    if (!program.length) throw new Failure("empty");
    exec(compile(program, language, options.maxDepth ?? DEFAULT_MAX_DEPTH));
    return { output, steps };
  } catch (error) {
    if (error instanceof Failure) {
      const e: RunError = { code: error.code, line: error.line };
      if (error.detail !== undefined) e.detail = error.detail;
      return { output, error: e, steps };
    }
    // RangeError (a very deep expression) or anything else: never let it reach the page
    return { output, error: { code: "syntax", line: 0 }, steps };
  }
};
