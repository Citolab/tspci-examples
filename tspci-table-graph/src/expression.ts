// A small arithmetic parser for the expressions an author types: numbers (decimal point or comma), + − × ÷ ^, brackets
// and the unknown. No eval: an expression can only compute. The tokens are also what the PCI shows.

export type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "^" }
  | { kind: "paren"; paren: "(" | ")" }
  | { kind: "unknown" };

export type Expression = { tokens: Token[]; evaluate: (unknown: number) => number };

export type Symbols = {
  /** What stands for the unknown, such as "?" or "x". */
  unknown: string[];
  /** Extra signs for multiplication next to * × ·, such as "x" when x is not the unknown. */
  times?: string[];
};

const OPERATORS: Record<string, "+" | "-" | "*" | "/" | "^"> = {
  "+": "+", "-": "-", "−": "-", "–": "-", "*": "*", "×": "*", "·": "*", "/": "/", ":": "/", "÷": "/", "^": "^",
};

export class ExpressionError extends Error {}

export function tokenize(source: string, symbols: Symbols): Token[] {
  const tokens: Token[] = [];
  const unknowns = [...symbols.unknown].sort((a, b) => b.length - a.length);
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) { i += space[0].length; continue; }
    const number = /^\d+(?:[.,]\d+)?|^[.,]\d+/.exec(rest);
    if (number) {
      tokens.push({ kind: "number", value: parseFloat(number[0].replace(",", ".")) });
      i += number[0].length;
      continue;
    }
    const unknown = unknowns.find((u) => rest.startsWith(u));
    if (unknown) { tokens.push({ kind: "unknown" }); i += unknown.length; continue; }
    const times = symbols.times?.find((t) => rest.startsWith(t));
    if (times) { tokens.push({ kind: "op", op: "*" }); i += times.length; continue; }
    if (OPERATORS[rest[0]]) { tokens.push({ kind: "op", op: OPERATORS[rest[0]] }); i++; continue; }
    if (rest[0] === "(" || rest[0] === ")") { tokens.push({ kind: "paren", paren: rest[0] }); i++; continue; }
    throw new ExpressionError(`unexpected "${rest[0]}" at ${i + 1}`);
  }
  // "3x" and "2(…)" mean multiplication: make it explicit, so the PCI shows it as well
  return tokens.reduce<Token[]>((all, token, index) => {
    const previous = tokens[index - 1];
    const endsValue = previous && (previous.kind === "number" || previous.kind === "unknown" || (previous.kind === "paren" && previous.paren === ")"));
    const startsValue = token.kind === "number" || token.kind === "unknown" || (token.kind === "paren" && token.paren === "(");
    const twoNumbers = previous?.kind === "number" && token.kind === "number"; // "1 2" is a typo, not 1 × 2
    return endsValue && startsValue && !twoNumbers ? [...all, { kind: "op", op: "*" }, token] : [...all, token];
  }, []);
}

type Node = (unknown: number) => number;

/** expression := term (("+" | "-") term)*; term := factor (("*" | "/") factor)*; factor := sign* power; power := atom ("^" factor)? */
function parse(tokens: Token[]): Node {
  let position = 0;
  const peek = () => tokens[position];
  const isOp = (token: Token | undefined, ...ops: string[]) => token?.kind === "op" && ops.includes(token.op);

  const expression = (): Node => {
    let left = term();
    while (isOp(peek(), "+", "-")) {
      const op = (tokens[position++] as { op: string }).op;
      const l = left, r = term();
      left = op === "+" ? (u) => l(u) + r(u) : (u) => l(u) - r(u);
    }
    return left;
  };
  const term = (): Node => {
    let left = factor();
    while (isOp(peek(), "*", "/")) {
      const op = (tokens[position++] as { op: string }).op;
      const l = left, r = factor();
      left = op === "*" ? (u) => l(u) * r(u) : (u) => l(u) / r(u);
    }
    return left;
  };
  const factor = (): Node => {
    if (isOp(peek(), "-", "+")) {
      const op = (tokens[position++] as { op: string }).op;
      const f = factor();
      return op === "-" ? (u) => -f(u) : f;
    }
    const base = atom();
    if (isOp(peek(), "^")) {
      position++;
      const exponent = factor();
      return (u) => Math.pow(base(u), exponent(u));
    }
    return base;
  };
  const atom = (): Node => {
    const token = tokens[position++];
    if (!token) throw new ExpressionError("the expression ends too soon");
    if (token.kind === "number") return () => token.value;
    if (token.kind === "unknown") return (u) => u;
    if (token.kind === "paren" && token.paren === "(") {
      const inner = expression();
      const close = tokens[position++];
      if (close?.kind !== "paren" || close.paren !== ")") throw new ExpressionError("a closing bracket is missing");
      return inner;
    }
    throw new ExpressionError(`unexpected ${token.kind === "op" ? token.op : token.kind === "paren" ? token.paren : "token"}`);
  };

  const node = expression();
  if (position < tokens.length) throw new ExpressionError("there is more after the expression");
  return node;
}

export function parseExpression(source: string, symbols: Symbols): Expression {
  const tokens = tokenize(source ?? "", symbols);
  if (!tokens.length) throw new ExpressionError("the expression is empty");
  const node = parse(tokens);
  return { tokens, evaluate: (unknown) => node(unknown) };
}

/** A typed number: decimal point or comma, an optional minus sign. NaN when it is not one. */
export function parseNumber(text: string): number {
  const clean = (text ?? "").trim().replace(/^[−–]/, "-").replace(",", ".");
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(clean) ? parseFloat(clean) : NaN;
}

/** Rounds away floating point noise (0.1 + 0.2), so results that are equal also look and compare equal. */
export const clean = (value: number) => (Number.isFinite(value) ? parseFloat(value.toPrecision(12)) : value);
