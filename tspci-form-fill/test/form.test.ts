// npm test: the logic of the form fill PCI (src/form.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRANSFER, WAYBILL, allChecks, authoringProblemCodes, displayValue, evaluate, formatDate, formatNumber, normalize, normalizeAll,
  ownValues, parseDate, parseForm, parseNumber, passes, rawFromNormalized, responseRecord, say, serializeForm, validEmail, validIban,
  validPhone, validPostcode, validationProblem, valuesFrom, matchesPattern, type Field, type Form,
} from "../src/form.ts";

const f = (type: Field["type"], extra: Partial<Field> = {}): Field => ({ id: "x", type, label: "X", ...extra });

test("say: a string, the language's text, or the other", () => {
  assert.equal(say("Name", "nl"), "Name");
  assert.equal(say({ en: "Name", nl: "Naam" }, "nl-NL"), "Naam");
  assert.equal(say({ en: "Name" }, "nl"), "Name");
  assert.equal(say(undefined), "");
});

test("parseNumber: decimal comma in Dutch, thousands separators, euros", () => {
  assert.equal(parseNumber("12,50", "nl"), 12.5);
  assert.equal(parseNumber("12.50", "nl"), 12.5); // lenient
  assert.equal(parseNumber("1.250", "nl"), 1250);
  assert.equal(parseNumber("1.234,56", "nl"), 1234.56);
  assert.equal(parseNumber("€ 1 234,56", "nl"), 1234.56);
  assert.equal(parseNumber("1,250", "en"), 1250);
  assert.equal(parseNumber("1,234.56", "en"), 1234.56);
  assert.equal(parseNumber("4,8", "en"), 4.8);
  assert.equal(parseNumber("25,-", "nl"), 25);
  assert.equal(parseNumber("-3,5", "nl"), -3.5);
  assert.equal(parseNumber("12 apples", "en"), null);
  assert.equal(parseNumber("1,2,3", "en"), null);
  assert.equal(parseNumber("", "en"), null);
});

test("formatNumber and dates", () => {
  assert.equal(formatNumber(89.45, "nl", 2), "89,45");
  assert.equal(formatNumber(4.8, "en"), "4.8");
  assert.equal(parseDate("10-11-2026"), "2026-11-10");
  assert.equal(parseDate("1/2/2026"), "2026-02-01");
  assert.equal(parseDate("2026-11-10"), "2026-11-10");
  assert.equal(parseDate("31-02-2026"), null);
  assert.equal(parseDate("29-02-2028"), "2028-02-29");
  assert.equal(parseDate("tomorrow"), null);
  assert.equal(formatDate("2026-11-10", "nl"), "10-11-2026");
  assert.equal(formatDate("2026-11-10", "en"), "10/11/2026");
});

test("formats: IBAN checksum, Dutch postcode, e-mail, phone", () => {
  assert.ok(validIban("NL91 ABNA 0417 1643 00"));
  assert.ok(validIban("nl91abna0417164300"));
  assert.ok(!validIban("NL92 ABNA 0417 1643 00")); // checksum
  assert.ok(!validIban("NL91 ABNA 0417 1643 0")); // length
  assert.ok(validIban("BE68 5390 0754 7034"));
  assert.ok(validIban("DE89 3704 0044 0532 0130 00"));
  assert.ok(validPostcode("1234 AB") && validPostcode("1234ab"));
  assert.ok(!validPostcode("0123 AB") && !validPostcode("1234 SS") && !validPostcode("12345"));
  assert.ok(validEmail("s.dewit@example.nl") && !validEmail("s.dewit@example") && !validEmail("a b@c.nl"));
  assert.ok(validPhone("0522 381 905") && validPhone("+31 6 1234 5678") && validPhone("0031612345678"));
  assert.ok(!validPhone("12345"));
  assert.ok(matchesPattern("ABC-12", "[A-Z]{3}-\\d{2}") && !matchesPattern("xABC-12", "[A-Z]{3}-\\d{2}"));
  assert.ok(!matchesPattern("x", "(")); // an invalid pattern never passes
});

test("normalize per field type: the same in every language", () => {
  assert.equal(normalize(f("text"), "  Sanne   de  Wit "), "Sanne de Wit");
  assert.equal(normalize(f("postcode"), "9721bg"), "9721 BG");
  assert.equal(normalize(f("postcode"), "9721  bg"), "9721 BG");
  assert.equal(normalize(f("iban"), "nl91 abna 0417 1643 00"), "NL91ABNA0417164300");
  assert.equal(normalize(f("phone"), "0522-381 905"), "0522381905");
  assert.equal(normalize(f("phone"), "0031 6 12"), "+31612");
  assert.equal(normalize(f("email"), " S.deWit@Example.NL "), "s.dewit@example.nl");
  assert.equal(normalize(f("amount"), "64,5", "nl"), "64.50");
  assert.equal(normalize(f("amount"), "64.5", "en"), "64.50");
  assert.equal(normalize(f("number"), "4,80", "nl"), "4.8");
  assert.equal(normalize(f("number"), "four", "nl"), "four");
  assert.equal(normalize(f("date"), "10-11-2026"), "2026-11-10");
  assert.equal(normalize(f("checkbox"), "true"), "true");
  assert.equal(normalize(f("checkbox"), "yes"), "");
  const group = f("checkbox", { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" }] });
  assert.equal(normalize(group, "c,a,z"), "a,c");
  assert.equal(normalize(f("signature"), "signed"), "signed");
});

test("displayValue: back as the candidate types it", () => {
  assert.equal(displayValue(f("amount"), "89.45", "nl"), "89,45");
  assert.equal(displayValue(f("number"), "4.8", "nl"), "4,8");
  assert.equal(displayValue(f("date"), "2026-11-10", "nl"), "10-11-2026");
  assert.equal(displayValue(f("postcode"), "7942 KD", "nl"), "7942 KD");
});

const form = (fields: Field[]): Form => ({ title: "T", sections: [{ id: "s", title: "S", fields }] });

test("checks: exact (case, spaces), one of, number within a margin, required", () => {
  const pc = f("postcode", { id: "pc" });
  const name = f("text", { id: "name" });
  const fm = form([pc, name]);
  assert.ok(passes(fm, pc, { type: "exact", value: "7942 KD" }, { pc: normalize(pc, "7942kd") }));
  assert.ok(passes(fm, name, { type: "exact", value: "Sanne de Wit" }, { name: "sanne de wit" }));
  assert.ok(!passes(fm, name, { type: "exact", value: "Sanne de Wit", caseSensitive: true }, { name: "sanne de wit" }));
  assert.ok(passes(fm, name, { type: "oneOf", values: ["5531", "order 5531"] }, { name: "Order 5531" }));
  assert.ok(!passes(fm, name, { type: "oneOf", values: ["5531"] }, { name: "" }));
  const w = f("number", { id: "w" });
  assert.ok(passes(form([w]), w, { type: "number", value: 4.8, margin: 0.05 }, { w: "4.84" }));
  assert.ok(!passes(form([w]), w, { type: "number", value: 4.8, margin: 0.05 }, { w: "4.9" }));
  assert.ok(!passes(form([w]), w, { type: "number", value: 0 }, { w: "" }));
  assert.ok(passes(fm, name, { type: "required" }, { name: "x" }));
  assert.ok(!passes(fm, name, { type: "required" }, { name: "" }));
});

test("checks: format and relations (sum, product, after, before, same)", () => {
  const a = f("amount", { id: "a" }), b = f("amount", { id: "b" }), t = f("amount", { id: "t" });
  const q = f("number", { id: "q" }), p = f("amount", { id: "p" });
  const d1 = f("date", { id: "d1" }), d2 = f("date", { id: "d2" });
  const i1 = f("iban", { id: "i1" }), i2 = f("iban", { id: "i2" });
  const fm = form([a, b, t, q, p, d1, d2, i1, i2]);
  const sum = { type: "relation", relation: "sum", fields: ["a", "b"] } as const;
  assert.ok(passes(fm, t, sum, { a: "64.50", b: "24.95", t: "89.45" }));
  assert.ok(!passes(fm, t, sum, { a: "64.50", b: "24.95", t: "89.50" }));
  assert.ok(passes(fm, t, sum, { a: "64.50", b: "", t: "64.50" })); // an empty line counts 0
  assert.ok(!passes(fm, t, sum, { a: "64.50", b: "", t: "" }));
  assert.ok(passes(fm, p, { type: "relation", relation: "product", fields: ["q", "a"] }, { q: "3", a: "2.50", p: "7.50" }));
  assert.ok(passes(fm, d2, { type: "relation", relation: "after", fields: ["d1"] }, { d1: "2026-11-10", d2: "2026-11-11" }));
  assert.ok(!passes(fm, d2, { type: "relation", relation: "after", fields: ["d1"] }, { d1: "2026-11-10", d2: "2026-11-10" }));
  assert.ok(passes(fm, d1, { type: "relation", relation: "before", fields: ["d2"] }, { d1: "2026-11-10", d2: "2026-11-11" }));
  assert.ok(passes(fm, i2, { type: "relation", relation: "same", fields: ["i1"] }, { i1: "NL91ABNA0417164300", i2: "NL91ABNA0417164300" }));
  assert.ok(!passes(fm, i2, { type: "relation", relation: "same", fields: ["unknown"] }, { i2: "x" }));
  assert.ok(passes(fm, i1, { type: "format", format: "iban" }, { i1: "NL91ABNA0417164300" }));
  assert.ok(!passes(fm, i1, { type: "format", format: "iban" }, { i1: "NL91ABNA0417164301" }));
  assert.ok(passes(fm, d1, { type: "format", format: "date" }, { d1: "2026-11-10" }));
});

test("the waybill: its solution passes every check; a typical candidate does not", () => {
  const e = evaluate(WAYBILL, WAYBILL.solution!);
  assert.equal(e.results.length, 14);
  assert.ok(e.correct);
  assert.equal(e.score, 13);
  assert.equal(e.maxscore, 13);
  const raw = { ...rawFromNormalized(WAYBILL, WAYBILL.solution!, "nl"), recipientPostcode: "9721bg", weight: "4,8", deliveryDate: "10-11-2026", signature: "" };
  const values = normalizeAll(WAYBILL, raw, "nl");
  assert.equal(values.recipientPostcode, "9721 BG");
  const r = evaluate(WAYBILL, values);
  const failed = r.results.filter((x) => !x.passed).map((x) => `${x.field}:${x.check.type}`);
  assert.deepEqual(failed, ["deliveryDate:relation", "deliveryDate:exact", "signature:required"]);
  assert.equal(r.score, 11);
});

test("the transfer: the total is the sum of the lines", () => {
  assert.ok(evaluate(TRANSFER, TRANSFER.solution!).correct);
  assert.equal(evaluate(TRANSFER, TRANSFER.solution!).maxscore, 8);
  const values = normalizeAll(TRANSFER, { line1: "64,50", line2: "24,95", total: "88,45" }, "nl");
  const totals = evaluate(TRANSFER, values).results.filter((x) => x.field === "total");
  assert.deepEqual(totals.map((x) => x.passed), [false, false]);
  const wrongLine = normalizeAll(TRANSFER, { line1: "65,40", line2: "24,95", total: "90,35" }, "nl");
  assert.deepEqual(evaluate(TRANSFER, wrongLine).results.filter((x) => x.field === "total").map((x) => x.passed), [true, false]);
});

test("validation feedback: required and the format of the type, not the answer", () => {
  assert.equal(validationProblem(f("text", { required: true }), " "), "required");
  assert.equal(validationProblem(f("text"), ""), null);
  assert.equal(validationProblem(f("postcode"), "97 21"), "postcode");
  assert.equal(validationProblem(f("postcode"), "9721bg"), null);
  assert.equal(validationProblem(f("iban"), "NL92ABNA0417164300"), "iban");
  assert.equal(validationProblem(f("amount"), "twelve"), "amount");
  assert.equal(validationProblem(f("amount"), "12,50", "nl"), null);
  assert.equal(validationProblem(f("date"), "31-02-2026"), "date");
  assert.equal(validationProblem(f("email"), "x@y"), "email");
  assert.equal(validationProblem(f("phone"), "06"), "phone");
  assert.equal(validationProblem(f("signature", { required: true }), ""), "required");
});

test("the response record: score, checks, values in order, JSON", () => {
  const rec = responseRecord(TRANSFER, normalizeAll(TRANSFER, { payee: "Fietsherstel Jansen", total: "89,45", line1: "64,50", line2: "24,95" }, "nl"));
  const get = (name: string) => rec.find((x) => x.name === name)?.base;
  assert.deepEqual(get("score"), { integer: 5 });
  assert.deepEqual(get("maxscore"), { integer: 8 });
  assert.deepEqual(get("correct"), { integer: 0 });
  assert.deepEqual(get("check1"), { integer: 1 });
  assert.deepEqual(get("check11"), { integer: 0 });
  assert.equal(get("check12"), undefined);
  assert.deepEqual(get("value1"), { string: "Fietsherstel Jansen" });
  assert.deepEqual(get("value5"), { string: "89.45" });
  assert.deepEqual(JSON.parse(get("values")!.string!), { payee: "Fietsherstel Jansen", line1: "64.50", line2: "24.95", total: "89.45" });
  assert.deepEqual(valuesFrom({ record: rec }), { payee: "Fietsherstel Jansen", line1: "64.50", line2: "24.95", total: "89.45" });
  assert.deepEqual(valuesFrom([{ fieldIdentifier: "values", value: '{"a":"1"}' }]), { a: "1" });
  assert.equal(valuesFrom("not json"), null);
});

test("parseForm: the example without settings, unknown parts left out, round trip", () => {
  assert.equal(say(parseForm("").title, "en"), "Waybill — domestic parcel");
  assert.equal(say(parseForm("", "transfer").title, "nl"), "Geld overmaken");
  assert.equal(say(parseForm("{oops", "transfer").title, "en"), "Make a transfer");
  const parsed = parseForm(JSON.stringify({
    title: "Order", sections: [{ title: "A", fields: [{ id: "q", type: "weird", label: "Q", checks: [{ type: "nope" }, { type: "oneOf", values: "a|b" }, { type: "format", format: "regex", pattern: "\\d+" }] }] }],
  }));
  const fld = parsed.sections[0].fields[0];
  assert.equal(fld.type, "text");
  assert.deepEqual(fld.checks, [{ type: "oneOf", values: ["a", "b"] }, { type: "format", format: "regex", pattern: "\\d+" }]);
  assert.equal(parsed.sections[0].id, "section1");
  assert.deepEqual(parseForm(serializeForm(WAYBILL)), WAYBILL);
  assert.deepEqual(parseForm(serializeForm(TRANSFER)), TRANSFER);
});

test("ownValues: only this form's fields", () => {
  assert.deepEqual(ownValues(TRANSFER, { payee: "A", nothing: "B", total: 3 }), { payee: "A", total: "3" });
  assert.deepEqual(ownValues(TRANSFER, null), {});
});

test("authoring problems", () => {
  assert.deepEqual(authoringProblemCodes(WAYBILL), []);
  assert.deepEqual(authoringProblemCodes(TRANSFER), []);
  assert.deepEqual(authoringProblemCodes({ title: "", sections: [] }), [{ code: "noFields" }]);
  const bad: Form = {
    title: "x",
    sections: [{ id: "s", title: "", fields: [
      { id: "a", type: "select", label: "A", checks: [{ type: "exact", value: "" }] },
      { id: "a", type: "text", label: "B", checks: [{ type: "relation", relation: "same", fields: ["zz"] }, { type: "format", format: "regex", pattern: "(" }] },
      { id: "score", type: "text", label: "C" },
    ] }],
    solution: { a: "x" },
  };
  const codes = authoringProblemCodes(bad).map((p) => p.code);
  assert.deepEqual(codes, ["noOptions", "emptyExact", "duplicateId", "unknownField", "badRegex", "reservedId", "solutionFails", "solutionFails", "solutionFails"]);
  assert.equal(allChecks(bad).length, 3);
});
