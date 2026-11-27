// npm test: the templates, the computed fields, the mistakes, the formats and the response of the document reading PCI
// (src/documents.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEMPLATES, answerFromRecord, answered, buildDocument, canonical, correctAnswer, defaultQuestion, exampleOf, mistakesOf, modelFrom,
  moneyText, numberText, parseDocumentSpec, parseNumber, parseShift, parseTime, problemsOf, responseFields, serializeDocumentSpec,
  showValue, suggestWrong, type Model,
} from "../src/documents.ts";

const plain = (fields: ReturnType<typeof responseFields>) => (fields ? Object.fromEntries(fields.map((f) => [f.name, f.value])) : null);
const shown = (model: Model, id: string) => {
  const field = model.doc.byId[id];
  return showValue(field, field.shown, model.language, model.currency);
};

test("parseNumber: Dutch and English, with a sign or a unit", () => {
  assert.equal(parseNumber("14,25", "nl"), 14.25);
  assert.equal(parseNumber("14.25", "nl"), 14.25); // either decimal sign
  assert.equal(parseNumber("14.25", "en"), 14.25);
  assert.equal(parseNumber("1.360,28", "nl"), 1360.28);
  assert.equal(parseNumber("1,360.28", "en"), 1360.28);
  assert.equal(parseNumber("2.390", "nl"), 2390); // a thousands separator in Dutch
  assert.equal(parseNumber("2,390", "en"), 2390);
  assert.equal(parseNumber("€ 4,76", "nl"), 4.76);
  assert.equal(parseNumber("€4.76", "en"), 4.76);
  assert.equal(parseNumber("7,-", "nl"), 7);
  assert.equal(parseNumber("17,5 uur", "nl"), 17.5);
  assert.equal(parseNumber("29 min", "en"), 29);
  assert.equal(parseNumber("−3", "en"), -3);
  assert.equal(parseNumber("23 512", "nl"), 23512);
  assert.equal(parseNumber(",5", "nl"), 0.5);
  for (const bad of ["", "abc", "1,2,3", "12 34", "€", "1.2.3,4"]) assert.equal(parseNumber(bad, "nl"), null, bad);
});

test("times and shifts", () => {
  assert.equal(parseTime("8:15"), 495);
  assert.equal(parseTime("08.15"), 495);
  assert.equal(parseTime("9"), 540);
  assert.equal(parseTime("24:00"), null);
  assert.equal(parseTime("8:75"), null);
  assert.deepEqual(parseShift("09:00-13:00"), { start: 540, end: 780 });
  assert.deepEqual(parseShift("9 - 17:30"), { start: 540, end: 1050 });
  assert.deepEqual(parseShift("9:00 tot 13:00"), { start: 540, end: 780 });
  assert.equal(parseShift(""), null);
  assert.equal(parseShift("vrij"), null);
  assert.equal(parseShift("off"), null);
  assert.equal(parseShift("13-9"), undefined);
  assert.equal(parseShift("morning"), undefined);
});

test("canonical: values in their language-neutral form", () => {
  assert.equal(canonical("money", "14,25", "nl"), "14.25");
  assert.equal(canonical("money", "921", "en"), "921.00");
  assert.equal(canonical("money", "€ 1.360,28", "nl"), "1360.28");
  assert.equal(canonical("number", "17,5", "nl"), "17.5");
  assert.equal(canonical("number", "23512", "en"), "23512");
  assert.equal(canonical("time", "8.05"), "08:05");
  assert.equal(canonical("shift", "9-13"), "09:00-13:00");
  assert.equal(canonical("shift", "vrij"), "");
  assert.equal(canonical("text", "  Sam  "), "Sam");
  assert.equal(canonical("money", "lots"), null);
  assert.equal(canonical("time", "25:00"), null);
});

test("the texts: euros, numbers and the rest by the language", () => {
  assert.equal(moneyText(900.61, "nl"), "€ 900,61");
  assert.equal(moneyText(900.61, "en"), "€900.61");
  assert.equal(moneyText(1360.28, "nl"), "€ 1.360,28");
  assert.equal(moneyText(1360.28, "en"), "€1,360.28");
  assert.equal(moneyText(12.5, "en", "CHF"), "CHF 12.50");
  assert.equal(numberText(23512, "nl"), "23.512");
  assert.equal(numberText(2390, "nl"), "2390");
  assert.equal(numberText(17.5, "nl"), "17,5");
  assert.equal(showValue({ kind: "money", minus: true }, "61.20", "nl"), "− € 61,20");
  assert.equal(showValue({ kind: "percent" }, "8", "nl"), "8%");
  assert.equal(showValue({ kind: "number", unit: "kWh" }, "2390", "en"), "2390 kWh");
  assert.equal(showValue({ kind: "shift" }, "09:00-13:00", "en"), "09:00–13:00");
  assert.equal(showValue({ kind: "shift" }, "", "nl"), "vrij");
  assert.equal(showValue({ kind: "shift" }, "", "en"), "off");
});

test("every template: unique fields, every value shown, the example's targets and mistakes exist", () => {
  for (const template of TEMPLATES) {
    for (const language of ["en", "nl"] as const) {
      const example = exampleOf(template, language);
      const doc = buildDocument(template, language, { values: example.values, mistakes: example.check });
      const ids = doc.fields.map((field) => field.id);
      assert.equal(new Set(ids).size, ids.length, `${template}: duplicate fields`);
      assert.ok(ids.length >= 12, `${template}: ${ids.length} fields`);
      for (const field of doc.fields) {
        assert.ok(/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.id), `${template}: ${field.id} is not an identifier`);
        assert.ok(field.label, `${template}: ${field.id} has no label`);
        if (field.kind !== "text" && field.kind !== "shift") assert.ok(field.shown !== "" && !field.shown.includes("NaN"), `${template}: ${field.id} = ${field.shown}`);
      }
      assert.ok(doc.byId[example.find.target], `${template}: find target`);
      assert.ok(doc.byId[example.answer.source], `${template}: answer source`);
      assert.deepEqual(mistakesOf(doc).sort(), Object.keys(example.check).sort(), `${template}: mistakes`);
      for (const id of Object.keys(example.check)) assert.ok(doc.byId[id].computed, `${template}: ${id} is computed`);
      // every input of the example is a value the author can change
      for (const input of doc.inputs) assert.ok(input.key in example.values, `${template}: ${input.key} not in the example`);
    }
  }
});

test("the payslip: wage, holiday allowance, gross, deductions and net computed", () => {
  const model = modelFrom({ template: "payslip", language: "nl" });
  assert.equal(shown(model, "wage"), "€ 912,00");
  assert.equal(shown(model, "holiday"), "€ 72,96");
  assert.equal(shown(model, "gross"), "€ 984,96");
  assert.equal(shown(model, "deductions"), "− € 84,35");
  assert.equal(shown(model, "net"), "€ 900,61");
  assert.equal(shown(model, "holidayPct"), "8%");
  assert.equal(model.question, "Tik op je nettoloon: het geld dat je op je rekening krijgt.");
});

test("the other examples: what they compute", () => {
  const en = (template: string, id: string) => shown(modelFrom({ template, language: "en" }), id);
  assert.equal(en("receipt", "item2Amount"), "€2.30");
  assert.equal(en("receipt", "count"), "8");
  assert.equal(en("receipt", "total"), "€15.24");
  assert.equal(en("receipt", "change"), "€4.76");
  assert.equal(en("receipt", "vat"), "€1.26");
  assert.equal(en("packingSlip", "line2Open"), "1");
  assert.equal(en("packingSlip", "totalDelivered"), "5");
  assert.equal(en("rota", "total1"), "17.5");
  assert.equal(en("rota", "day1Person3"), "off");
  assert.equal(en("timetable", "bus4Stop2"), "09:19");
  assert.equal(en("timetable", "bus5Stop5"), "10:03");
  assert.equal(en("energyBill", "usage"), "2390 kWh");
  assert.equal(en("energyBill", "meterEnd"), "25,902 kWh");
  assert.equal(en("energyBill", "total"), "€1,360.28");
  assert.equal(en("energyBill", "balance"), "€40.28");
  assert.equal(en("dosage", "perDay1"), "2");
  assert.equal(en("dosage", "mg4"), "3000 mg");
});

test("the packing slip: what is not in the box is not in the box's list", () => {
  const model = modelFrom({ template: "packingSlip" });
  assert.equal(model.doc.byId.line4Received, undefined); // the spirit level is missing
  assert.ok(model.doc.byId.line3Received);
  assert.equal(model.doc.panels[1].kind, "box");
});

test("a wrong field carries on: the fields after it are computed from what the document shows", () => {
  const example = exampleOf("payslip", "en");
  const doc = buildDocument("payslip", "en", { values: example.values, mistakes: { wage: "921" } });
  assert.equal(doc.byId.wage.shown, "921.00");
  assert.equal(doc.byId.wage.natural, "912.00");
  assert.ok(doc.byId.wage.wrong);
  // holiday allowance 8% of the wage on the document: right, as are the fields after it
  assert.equal(doc.byId.holiday.shown, "73.68");
  assert.equal(doc.byId.gross.shown, "994.68");
  assert.deepEqual(mistakesOf(doc), ["wage"]);
  // a wrong value that is the right one is no mistake, and one that cannot be read is ignored
  const same = buildDocument("payslip", "en", { values: example.values, mistakes: { wage: "912,00", net: "lots" } });
  assert.deepEqual(mistakesOf(same), []);
  // an input cannot be wrong: only computed fields
  const input = buildDocument("payslip", "en", { values: example.values, mistakes: { hours: "70" } });
  assert.equal(input.byId.hours.shown, "64");
});

test("the author's values: canonical or as typed in the language; what cannot be read is the example's", () => {
  const doc = buildDocument("payslip", "nl", { values: { hours: "70", rate: "15,50", tax: "x" }, mistakes: {} });
  assert.equal(doc.byId.wage.shown, "1085.00");
  assert.equal(doc.byId.tax.shown, "61.20");
  assert.equal(doc.byId.employer.shown, "Tuincentrum De Groene Hoek");
});

test("rows of a list: more or fewer items on the receipt", () => {
  const values = { ...exampleOf("receipt", "en").values, items: "2" };
  const two = buildDocument("receipt", "en", { values, mistakes: {} });
  assert.equal(two.rows?.count, 2);
  assert.equal(two.byId.item3Name, undefined);
  assert.equal(two.byId.total.shown, "3.79"); // 2.49 + 2.30 − 1.00
  const many = buildDocument("receipt", "en", { values: { ...values, items: "20" }, mistakes: {} });
  assert.equal(many.rows?.count, 8);
});

test("the document setting in JSON, and back", () => {
  const spec = { values: { hours: "70" }, mistakes: { net: "900.00" } };
  assert.deepEqual(parseDocumentSpec(serializeDocumentSpec(spec)), spec);
  assert.deepEqual(parseDocumentSpec('{"values":{"hours":70}}'), { values: { hours: "70" }, mistakes: {} });
  for (const bad of ["", "nope", "[]", '{"mistakes":{}}']) assert.equal(parseDocumentSpec(bad), null, bad);
});

test("find: the field the pupil tapped, and whether it is the right one", () => {
  const model = modelFrom({ template: "payslip", task: "find" });
  assert.equal(answered(model, { marked: [], typed: "" }), false);
  assert.equal(responseFields(model, { marked: [], typed: "" }), null);
  assert.deepEqual(plain(responseFields(model, { marked: ["gross"], typed: "" })), { correct: false, field: "gross" });
  assert.deepEqual(plain(responseFields(model, { marked: ["net"], typed: "" })), { correct: true, field: "net" });
  // more than one right field
  const either = modelFrom({ template: "rota", task: "find", targets: "day1Person3, day2Person1", question: "Tap a day off." });
  assert.deepEqual(either.targets, ["day1Person3", "day2Person1"]);
  assert.deepEqual(plain(responseFields(either, { marked: ["day2Person1"], typed: "" })), { correct: true, field: "day2Person1" });
  // a target that is not in the document is left out
  assert.deepEqual(modelFrom({ template: "rota", task: "find", targets: "nope, total1" }).targets, ["total1"]);
});

test("check: found, total, wrong taps, and per mistake whether it was found", () => {
  const model = modelFrom({ template: "payslip", task: "check" });
  assert.equal(model.question, "This payslip has 2 mistakes. Tap every mistake.");
  assert.deepEqual(mistakesOf(model.doc), ["wage", "deductions"]);
  assert.deepEqual(plain(responseFields(model, { marked: ["deductions", "net"], typed: "" })), {
    correct: false, found: 1, total: 2, wrong: 1, mistake1: false, mistake2: true,
  });
  assert.deepEqual(plain(responseFields(model, { marked: ["wage", "deductions"], typed: "" })), {
    correct: true, found: 2, total: 2, wrong: 0, mistake1: true, mistake2: true,
  });
  // one mistake: the question says so
  assert.equal(modelFrom({ template: "timetable", task: "check", language: "nl" }).question, "In deze dienstregeling staat een fout. Tik op de fout.");
  assert.equal(modelFrom({ template: "rota", task: "check", document: serializeDocumentSpec({ values: {}, mistakes: {} }) }).question, "Tap every mistake in this rota.");
  // the example's mistakes only come with the example's document for check
  assert.deepEqual(mistakesOf(modelFrom({ template: "payslip", task: "find" }).doc), []);
});

test("answer: the number, whether it is right (within the margin), and where it was found", () => {
  const model = modelFrom({ template: "payslip", task: "answer", language: "nl" });
  assert.equal(model.answer, 14.25);
  assert.equal(model.unit, "€");
  assert.ok(model.unitBefore);
  assert.deepEqual(plain(responseFields(model, { marked: [], typed: "14,25" })), { correct: true, answer: 14.25 });
  assert.deepEqual(plain(responseFields(model, { marked: ["rate"], typed: "€ 14,25" })), { correct: true, answer: 14.25, source: "rate", sourceCorrect: true });
  assert.deepEqual(plain(responseFields(model, { marked: ["wage"], typed: "912" })), { correct: false, answer: 912, source: "wage", sourceCorrect: false });
  // only a mark, no number yet
  assert.deepEqual(plain(responseFields(model, { marked: ["rate"], typed: "" })), { correct: false, source: "rate", sourceCorrect: true });
  // text that is no number
  assert.deepEqual(plain(responseFields(model, { marked: [], typed: "veel" })), { correct: false });
  // a margin
  const margin = modelFrom({ template: "timetable", task: "answer", tolerance: "1" });
  assert.equal(margin.answer, 29);
  assert.equal(margin.unit, "minutes");
  assert.equal(plain(responseFields(margin, { marked: [], typed: "30" }))?.correct, true);
  assert.equal(plain(responseFields(margin, { marked: [], typed: "31" }))?.correct, false);
  // without marking the source, the response has no source
  const noSource = modelFrom({ template: "payslip", task: "answer", markSource: "false" });
  assert.deepEqual(plain(responseFields(noSource, { marked: ["rate"], typed: "14.25" })), { correct: true, answer: 14.25 });
});

test("answer: the answer from the target field, the question and unit made from it", () => {
  const model = modelFrom({ template: "energyBill", task: "answer", targets: "usage" });
  assert.equal(model.answer, 2390);
  assert.equal(model.unit, "kWh");
  assert.equal(model.question, "Find in the document: Usage.");
  const own = modelFrom({ template: "energyBill", task: "answer", targets: "usage", answer: "2.390", language: "nl", unit: "kilowattuur" });
  assert.equal(own.answer, 2390);
  assert.equal(own.unit, "kilowattuur");
  // a time is no number: the author gives the answer
  assert.equal(modelFrom({ template: "timetable", task: "answer", targets: "bus1Stop1" }).answer, null);
});

test("the correct response, and back from a record", () => {
  for (const template of TEMPLATES) {
    for (const task of ["find", "check", "answer"] as const) {
      const model = modelFrom({ template, task, language: "nl" });
      const answer = correctAnswer(model);
      assert.ok(answer, `${template} ${task}`);
      const fields = responseFields(model, answer!)!;
      assert.equal(plain(fields)?.correct, true, `${template} ${task}`);
      const back = answerFromRecord(model, fields.map(({ name, value }) => ({ name, value })));
      assert.deepEqual(plain(responseFields(model, back!)), plain(fields), `${template} ${task}`);
    }
  }
});

test("the problems an author sees", () => {
  assert.deepEqual(problemsOf(modelFrom({ template: "payslip", task: "check", document: serializeDocumentSpec({ values: {}, mistakes: {} }) })), ["noMistakes"]);
  const nine = Object.fromEntries(["item1Amount", "item2Amount", "item3Amount", "item4Amount", "item5Amount", "count", "total", "change", "vat"].map((id) => [id, "99"]));
  assert.deepEqual(problemsOf(modelFrom({ template: "receipt", task: "check", document: serializeDocumentSpec({ values: exampleOf("receipt", "en").values, mistakes: nine }) })), ["tooManyMistakes"]);
  assert.deepEqual(problemsOf(modelFrom({ template: "timetable", task: "answer", targets: "bus1Stop1" })), ["noAnswer"]);
  const spec = { values: { hours: "many" }, mistakes: { net: "?" } };
  assert.deepEqual(problemsOf(modelFrom({ template: "payslip" }), spec), ["badValue", "badMistake"]);
  assert.deepEqual(problemsOf(modelFrom({ template: "payslip" })), []);
});

test("a wrong value to start from: a little off", () => {
  const doc = buildDocument("rota", "en", { values: exampleOf("rota", "en").values, mistakes: {} });
  assert.equal(suggestWrong(doc.byId.total1), "18.5");
  assert.equal(suggestWrong(doc.byId.total2), "25");
  const timetable = buildDocument("timetable", "en", { values: exampleOf("timetable", "en").values, mistakes: {} });
  assert.equal(suggestWrong(timetable.byId.bus1Stop2), "07:54");
  const payslip = buildDocument("payslip", "en", { values: exampleOf("payslip", "en").values, mistakes: {} });
  assert.equal(suggestWrong(payslip.byId.net), "910.61");
  assert.equal(suggestWrong(payslip.byId.holiday), "82.96");
  for (const field of payslip.fields.filter((f) => f.computed)) {
    const wrong = buildDocument("payslip", "en", { values: exampleOf("payslip", "en").values, mistakes: { [field.id]: suggestWrong(field) } });
    assert.ok(wrong.byId[field.id].wrong, field.id);
  }
});

test("the default question for a field the author chose", () => {
  const model = modelFrom({ template: "payslip", task: "find", targets: "gross" });
  assert.equal(model.question, "Tap: Total gross.");
  assert.equal(defaultQuestion({ ...model, language: "nl", doc: modelFrom({ template: "payslip", language: "nl" }).doc }), "Tik op: Totaal bruto.");
});
