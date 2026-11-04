// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// npm test: the block language (src/interpreter.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, inputValue, isName, parseExpression, parseInputs, run, show, type Stmt, type Value } from "../src/interpreter.ts";

const calc = (source: string, vars: Record<string, Value> = {}, language: "en" | "nl" | "fr" = "en"): Value =>
  evaluate(parseExpression(source, language)[0], new Map(Object.entries(vars)), language);
const fails = (source: string, code: string, vars: Record<string, Value> = {}) =>
  assert.throws(() => calc(source, vars), (e: any) => e.code === code, `${source} → ${code}`);

test("arithmetic, with precedence and without floating point noise", () => {
  assert.equal(calc("1 + 2 * 3"), 7);
  assert.equal(calc("(1 + 2) * 3"), 9);
  assert.equal(calc("0.1 + 0.2"), 0.3);
  assert.equal(calc("7 / 2"), 3.5);
  assert.equal(calc("7 // 2"), 3);
  assert.equal(calc("7 div 2"), 3);
  assert.equal(calc("7 % 3"), 1);
  assert.equal(calc("7 mod 3"), 1);
  assert.equal(calc("-7 mod 3"), 2); // the sign of the divisor
  assert.equal(calc("2 ^ 10"), 1024);
  assert.equal(calc("2 ** 3 ** 2"), 512); // right to left
  assert.equal(calc("-2 ^ 2"), -4);
  assert.equal(calc("10 − 4 × 2 ÷ 4"), 8);
  assert.equal(calc("n * 2", { n: 21 }), 42);
});

test("text, comparisons and logic", () => {
  assert.equal(calc('"sum: " + 3'), "sum: 3");
  assert.equal(calc("'a' + 'b'"), "ab");
  assert.equal(calc("“curly”"), "curly");
  assert.equal(calc("3 = 3"), true);
  assert.equal(calc("3 == 3.0"), true);
  assert.equal(calc("3 <> 4"), true);
  assert.equal(calc("3 ≠ 3"), false);
  assert.equal(calc("2 ≤ 3 and 3 ≥ 3"), true);
  assert.equal(calc("'b' > 'a'"), true);
  assert.equal(calc("3 = '3'"), false);
  assert.equal(calc("not (1 > 2) or false"), true);
  assert.equal(calc("1 < 2 && !(2 < 1)"), true);
  assert.equal(calc("n mod 2 = 0", { n: 4 }), true);
  // short circuit: the right side is not evaluated
  assert.equal(calc("false and x > 1"), false);
  assert.equal(calc("true or x > 1"), true);
});

test("words of the language", () => {
  assert.equal(calc("waar en niet onwaar", {}, "nl"), true);
  assert.equal(calc("faux ou vrai", {}, "fr"), true);
  assert.equal(calc("1 < 2 and 2 < 3", {}, "nl"), true); // English always works
  assert.equal(isName("en", "nl"), false);
  assert.equal(isName("en", "en"), true);
  assert.equal(isName("totaal_2"), true);
  assert.equal(isName("2x"), false);
  assert.equal(isName("x+1"), false);
  assert.equal(isName("größe"), true);
  assert.equal(show(true, "nl"), "waar");
  assert.equal(show(false, "fr"), "faux");
});

test("functions", () => {
  assert.equal(calc("abs(-3)"), 3);
  assert.equal(calc("round(2.5)"), 3);
  assert.equal(calc("floor(2.7) + ceil(2.1)"), 5);
  assert.equal(calc("sqrt(16)"), 4);
  assert.equal(calc("max(1, 5, 3) - min(4, 2)"), 3);
  assert.equal(calc('length("hello")'), 5);
  assert.equal(calc('lengte("hoi")'), 3);
  fails("foo(1)", "unknownFunction");
  fails("abs()", "arguments");
  fails('abs("x")', "arguments");
  fails("sqrt(-1)", "arguments");
  fails("length(3)", "arguments");
});

test("errors in expressions", () => {
  fails("1 +", "syntax");
  fails("(1 + 2", "syntax");
  fails("1 2", "syntax");
  fails("'open", "syntax");
  fails("x $ 2", "syntax");
  fails("", "syntax");
  fails("and", "syntax");
  fails("y + 1", "undefined");
  fails("'a' - 1", "notNumber");
  fails("true + 1", "notNumber");
  fails("1 / 0", "divZero");
  fails("1 mod 0", "divZero");
  fails("1 < 'a'", "notComparable");
  fails("1 and true", "notBoolean");
  fails("not 3", "notBoolean");
});

test("no JavaScript: names of JavaScript objects are just variables", () => {
  fails("constructor", "undefined");
  fails("alert(1)", "unknownFunction");
  fails("this.x", "syntax");
  fails("x[0]", "syntax");
  fails("`template`", "syntax");
  assert.equal(calc("toString", { toString: 3 }), 3);
});

test("input values: numbers when they read as one", () => {
  assert.equal(inputValue("5"), 5);
  assert.equal(inputValue(" 2,5 "), 2.5);
  assert.equal(inputValue("-3"), -3);
  assert.equal(inputValue("hello"), "hello");
  assert.equal(inputValue("1e3"), "1e3");
  assert.deepEqual(parseInputs("5\n\nab\n7.5\n"), [5, "ab", 7.5]);
  assert.equal(show(0.1 + 0.2), "0.3");
  assert.equal(show(1 / 3), "0.333333333333");
  assert.equal(show(-0), "0");
  assert.equal(show(1e-7), "0.0000001");
});

const sum: Stmt[] = [
  { kind: "input", line: 1, name: "n" },
  { kind: "set", line: 2, name: "total", expr: "0" },
  { kind: "for", line: 3, name: "i", from: "1", to: "n", body: [{ kind: "set", line: 4, name: "total", expr: "total + i" }] },
  { kind: "print", line: 5, expr: "total" },
];

test("a program: input, set, for, print", () => {
  assert.deepEqual(run(sum, [5]), { output: ["15"], steps: 1 + 1 + (1 + 5 * 2) + 1 });
  assert.deepEqual(run(sum, [0]).output, ["0"]); // from 1 to 0 does not run
  assert.deepEqual(run(sum, [1]).output, ["1"]);
});

test("if, if/else, while, repeat, and a for that does not run", () => {
  const program: Stmt[] = [
    { kind: "set", line: 1, name: "i", expr: "1" },
    {
      kind: "while", line: 2, cond: "i <= 4", body: [
        { kind: "if", line: 3, cond: "i mod 2 = 0", body: [{ kind: "print", line: 4, expr: '"even", i' }], other: [{ kind: "print", line: 6, expr: '"odd", i' }] },
        { kind: "set", line: 7, name: "i", expr: "i + 1" },
      ],
    },
    { kind: "repeat", line: 8, count: "2", body: [{ kind: "print", line: 9, expr: "'hi'" }] },
    { kind: "for", line: 10, name: "k", from: "3", to: "1", body: [{ kind: "print", line: 11, expr: "k" }] },
    { kind: "for", line: 12, name: "k", from: "1.5", to: "3", body: [{ kind: "print", line: 13, expr: "k" }] },
    { kind: "if", line: 14, cond: "k = 2.5", body: [{ kind: "print", line: 15, expr: "'done'" }] },
  ];
  assert.deepEqual(run(program).output, ["odd 1", "even 2", "odd 3", "even 4", "hi", "hi", "1.5", "2.5", "done"]);
});

test("errors stop the program, with the line", () => {
  const at = (program: Stmt[], inputs: Value[] = []) => run(program, inputs).error;
  assert.deepEqual(at([]), { code: "empty", line: 0 });
  assert.deepEqual(at([{ kind: "print", line: 1, expr: "1" }, { kind: "set", line: 2, name: "x", expr: null }]), { code: "blank", line: 2 });
  assert.deepEqual(at([{ kind: "set", line: 1, name: "x + 1", expr: "2" }]), { code: "notName", line: 1, detail: "x + 1" });
  assert.deepEqual(at([{ kind: "print", line: 1, expr: "1 +" }]), { code: "syntax", line: 1, detail: "1 +" });
  assert.deepEqual(at([{ kind: "print", line: 1, expr: "y" }]), { code: "undefined", line: 1, detail: "y" });
  assert.deepEqual(at([{ kind: "input", line: 1, name: "a" }, { kind: "input", line: 2, name: "b" }], [1]), { code: "noInput", line: 2 });
  assert.deepEqual(at([{ kind: "if", line: 1, cond: "3", body: [] }]), { code: "notBoolean", line: 1, detail: "3" });
  assert.deepEqual(at([{ kind: "repeat", line: 1, count: "2.5", body: [] }]), { code: "notWhole", line: 1, detail: "2.5" });
  assert.deepEqual(at([{ kind: "for", line: 1, name: "i", from: "'a'", to: "3", body: [] }]), { code: "notNumber", line: 1, detail: "a" });
  // the output before the error is kept; the blank is found before anything runs
  const r = run([{ kind: "print", line: 1, expr: "1" }, { kind: "print", line: 2, expr: "1 / 0" }]);
  assert.deepEqual(r.output, ["1"]);
  assert.deepEqual(r.error, { code: "divZero", line: 2 });
  assert.deepEqual(run([{ kind: "print", line: 1, expr: "1" }, { kind: "print", line: 2, expr: "" }]).output, []);
});

test("a program that never stops is stopped", () => {
  const forever: Stmt[] = [{ kind: "while", line: 1, cond: "true", body: [{ kind: "set", line: 2, name: "x", expr: "1" }] }];
  const r = run(forever, [], { maxSteps: 1000 });
  assert.equal(r.error?.code, "tooManySteps");
  assert.ok(r.steps <= 1001);
  const printing: Stmt[] = [{ kind: "while", line: 1, cond: "true", body: [{ kind: "print", line: 2, expr: "1" }] }];
  const p = run(printing, [], { maxOutput: 50 });
  assert.deepEqual(p.error, { code: "tooMuchOutput", line: 2, detail: "50" });
  assert.equal(p.output.length, 50);
});

test("nesting deeper than allowed", () => {
  const nest = (depth: number): Stmt[] =>
    depth === 0 ? [{ kind: "print", line: 9, expr: "1" }] : [{ kind: "repeat", line: depth, count: "1", body: nest(depth - 1) }];
  assert.deepEqual(run(nest(5), [], { maxDepth: 5 }).output, ["1"]);
  assert.equal(run(nest(6), [], { maxDepth: 5 }).error?.code, "tooDeep");
});

test("true and false print in the language of the texts", () => {
  assert.deepEqual(run([{ kind: "print", line: 1, expr: "1 < 2" }], [], { language: "nl" }).output, ["waar"]);
  assert.deepEqual(run([{ kind: "print", line: 1, expr: '"is " + (1 > 2)' }], [], { language: "fr" }).output, ["is faux"]);
});
