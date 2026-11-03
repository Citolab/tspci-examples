// npm test: the formula engine (src/formula.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EN, NL, canonical, display, evaluateSheet, localize, responseText, shift } from "../src/formula.ts";

const sheet = (inputs: Record<string, string>, locale = EN) => {
  const values = evaluateSheet(inputs, { columns: 26, rows: 100 }, locale);
  return (ref: string) => display(values.get(ref) ?? null, locale);
};

test("literals", () => {
  const v = sheet({ A1: "1.5", A2: "15%", A3: "apples", A4: "'12", A5: "true", A6: "-.5" });
  assert.deepEqual(["A1", "A2", "A3", "A4", "A5", "A6"].map(v), ["1.5", "0.15", "apples", "12", "TRUE", "-0.5"]);
});

test("arithmetic as Excel", () => {
  const v = sheet({
    A1: "=1+2*3", A2: "=(1+2)*3", A3: "=-2^2", A4: "=2^3^2", A5: "=0.1+0.2", A6: "=10/4", A7: "=1/0", A8: "=50%*10",
    A9: '="a"&1.5&TRUE', A10: "=3>2", A11: '="Apple"="apple"', A12: '="3"+1', A13: '="x"+1',
  });
  assert.deepEqual(
    ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A13"].map(v),
    ["7", "9", "4", "64", "0.3", "2.5", "#DIV/0!", "5", "a1.5TRUE", "TRUE", "TRUE", "4", "#VALUE!"],
  );
});

test("references, ranges and errors", () => {
  const v = sheet({
    A1: "2", A2: "3", A3: "text", B1: "=A1*A2", B2: "=SUM(A1:A3)", B3: "=A9", B4: "=C4", C4: "=B4", B5: "=SUM(", B6: "=FOO(1)",
    B7: "=$A$1+A$2", B8: "=A1:A2", B9: "=AAA1",
  });
  assert.deepEqual(
    ["B1", "B2", "B3", "B4", "C4", "B5", "B6", "B7", "B8", "B9"].map(v),
    ["6", "5", "0", "#CIRC!", "#CIRC!", "#ERROR!", "#NAME?", "5", "#VALUE!", "#REF!"],
  );
});

test("functions", () => {
  const v = sheet({
    A1: "4", A2: "8", A3: "", A4: "x", A5: "6",
    B1: "=AVERAGE(A1:A5)", B2: "=MIN(A1:A5)", B3: "=MAX(A1:A5,10)", B4: "=COUNT(A1:A5)", B5: "=COUNTA(A1:A5)",
    B6: "=ROUND(2.675,2)", B7: "=ROUND(-2.5)", B8: "=ROUNDUP(1.21,1)", B9: "=ROUNDDOWN(-1.29,1)", B10: "=INT(-1.5)",
    B11: "=MOD(-7,3)", B12: "=SQRT(-1)", B13: '=IF(A1>5,"big","small")', B14: "=IF(A2>5,A2*2)", B15: "=AND(A1>1,A2>1)",
    B16: "=OR(FALSE,A1=4)", B17: "=NOT(TRUE)", B18: '=COUNTIF(A1:A5,">5")', B19: '=SUMIF(A1:A5,"<>8")', B20: "=MEDIAN(A1:A5)",
    B21: "=PRODUCT(A1,A2)", B22: "=POWER(2,10)", B23: "=ROUND(PI(),4)", B24: '=COUNTIF(A1:A5,"x")', B25: "=AVERAGE(A3)",
  });
  assert.deepEqual(
    Array.from({ length: 25 }, (_, i) => v(`B${i + 1}`)),
    ["6", "4", "10", "3", "4", "2.68", "-3", "1.3", "-1.2", "-2", "2", "#NUM!", "small", "16", "TRUE", "TRUE", "FALSE",
      "2", "10", "6", "32", "1024", "3.1416", "1", "#DIV/0!"],
  );
});

test("Dutch: decimal comma, semicolons and function names", () => {
  const typed = { A1: "1,5", A2: "2,5", A3: "=SOM(A1;A2)*2,5", A4: "=ALS(A1>1;WAAR;ONWAAR)", A5: '=AANTAL.ALS(A1:A2;">2")' };
  const stored = Object.fromEntries(Object.entries(typed).map(([ref, text]) => [ref, canonical(text, NL)]));
  assert.deepEqual(stored, { A1: "1.5", A2: "2.5", A3: "=SOM(A1,A2)*2.5", A4: "=ALS(A1>1,WAAR,ONWAAR)", A5: '=AANTAL.ALS(A1:A2,">2")' });
  const v = sheet(stored, NL);
  assert.deepEqual(["A1", "A3", "A4", "A5"].map(v), ["1,5", "10", "WAAR", "1"]);
  assert.equal(localize("=SUM(A1,B1)*1.5", NL), "=SUM(A1;B1)*1,5");
  assert.equal(localize("0.45", NL), "0,45");
  assert.equal(canonical("text, with comma", NL), "text, with comma");
});

test("fill and paste move relative references", () => {
  assert.equal(shift("=B2*C2", 1, 0), "=B3*C3");
  assert.equal(shift("=$B$2*C$2+$D1", 2, 1), "=$B$2*D$2+$D3");
  assert.equal(shift("=SUM(A1:A3)", 0, 2), "=SUM(C1:C3)");
  assert.equal(shift("=A1", -1, 0), "=#REF!");
  assert.equal(sheet({ A1: shift("=A1", -1, 0) })("A1"), "#REF!");
  assert.equal(shift('="A1"&A1', 1, 0), '="A1"&A2');
  assert.equal(shift("12", 1, 0), "12");
});

test("the response is the same in every language", () => {
  const values = evaluateSheet({ A1: "=0.45*6+2.19*2+1.09*3+4.75" }, { columns: 5, rows: 5 }, NL);
  assert.equal(responseText(values.get("A1")), "15.1");
  assert.equal(responseText(null), null);
});
