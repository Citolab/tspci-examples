// npm test: the cash register (src/till.ts and the shopping in src/money.ts): deals, cash rounding, the shopping from
// the settings, what each key of the till does, the response and the correct response, in every currency.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authoringProblems, cashRound, correctFor, defaultItems, lineValue, parseItems, serializeItems, settingsProblems, taskFrom, type RecordResponse,
  type Settings, type ShopItem,
} from "../src/money.ts";
import {
  type Key, type TillState, emptyTill, entryAmount, itemsRungUp, linesValue, phaseOf, pressKey, receiptRows, registerResponse, ring, rungUp, tillContext,
  tillFor, tillOf,
} from "../src/till.ts";

const fields = (response: RecordResponse | undefined) =>
  Object.fromEntries((response?.record ?? []).map((f) => [f.name, f.base.float ?? f.base.integer ?? f.base.boolean]));

/** Keys typed one after another: "10.5" types 1, 0, the separator and 5; words are keys ("code", "total"). */
function type(till: TillState, ctx: ReturnType<typeof tillContext>, ...keys: string[]): TillState {
  for (const k of keys) {
    if (/^[\d.]+$/.test(k)) for (const c of k) till = pressKey(till, (c === "." ? "sep" : c) as Key, ctx);
    else till = pressKey(till, k as Key, ctx);
  }
  return till;
}

const register = (settings: Settings = {}) => taskFrom({ task: "register", given: "10", ...settings });

test("lineValue: deals on a line, in whole hundredths", () => {
  assert.equal(lineValue(115, 2, null), 230);
  // 2 for 2,00: per pair, the rest at the normal price
  assert.equal(lineValue(115, 2, { kind: "multi", count: 2, price: 200 }), 200);
  assert.equal(lineValue(115, 3, { kind: "multi", count: 2, price: 200 }), 315);
  assert.equal(lineValue(115, 1, { kind: "multi", count: 2, price: 200 }), 115);
  // 3 for 2: a multi deal at the price of two
  assert.equal(lineValue(90, 6, { kind: "multi", count: 3, price: 180 }), 360);
  // −25% of the line, rounded half up: 3 × 0,45 = 1,35 → 1,0125 → 1,01; 0,10 −25% → 0,075 → 0,08
  assert.equal(lineValue(45, 3, { kind: "percent", percent: 25 }), 101);
  assert.equal(lineValue(10, 1, { kind: "percent", percent: 25 }), 8);
  assert.equal(lineValue(360, 1, { kind: "percent", percent: 25 }), 270);
  assert.ok(Number.isInteger(lineValue(333, 7, { kind: "percent", percent: 33 })));
});

test("cashRound: to 5 cent (Dutch practice), 10, 50, a whole unit, or not", () => {
  for (const [cents, rounded] of [[730, 730], [731, 730], [732, 730], [733, 735], [734, 735], [736, 735], [737, 735], [738, 740], [739, 740]])
    assert.equal(cashRound(cents, 5), rounded, String(cents));
  assert.equal(cashRound(735, 10), 740); // half up
  assert.equal(cashRound(1225, 50), 1250);
  assert.equal(cashRound(1249, 100), 1200);
  assert.equal(cashRound(1250, 100), 1300);
  assert.equal(cashRound(733, 1), 733);
  assert.equal(cashRound(2, 5), 5); // never 0 for something bought
});

test("parseItems: the shopping from the settings, with defaults for what is left out", () => {
  assert.deepEqual(parseItems("").items, defaultItems("en"));
  assert.deepEqual(parseItems("not json", "nl").items.map((i) => i.name), ["Melk", "Brood", "Appel", "Kaas"]);
  const { items, invalid } = parseItems(
    JSON.stringify([
      { code: "7", name: " Tea ", price: 185, quantity: 2, look: "jar" },
      { code: "abc", price: 90, quantity: 0, deal: { kind: "multi", count: 1, price: 50 }, look: "spaceship" },
      { name: "No price" },
      { price: 12.5 },
      { code: "9", name: "Jam", price: 240, deal: { kind: "percent", percent: 50 } },
    ])
  );
  assert.equal(invalid, 2);
  assert.deepEqual(items, [
    { code: "7", name: "Tea", price: 185, quantity: 2, deal: null, look: "jar" },
    { code: "102", name: "Item 2", price: 90, quantity: 1, deal: null, look: "box" },
    { code: "9", name: "Jam", price: 240, quantity: 1, deal: { kind: "percent", percent: 50 }, look: "box" },
  ]);
  assert.deepEqual(parseItems(serializeItems(items)).items, items);
});

test("the register from the settings: what the shopping comes to, and the change", () => {
  const model = register();
  assert.equal(model.task, "register");
  assert.deepEqual(model.register && { count: model.register.count, value: model.register.value, toPay: model.register.toPay }, { count: 7, value: 850, toPay: 850 });
  assert.equal(model.price, 850);
  assert.equal(model.asked, 150);
  assert.equal(model.register!.tillCalculates, true);
  assert.equal(model.register!.fewestChange, false);
  assert.deepEqual(settingsProblems(model), []);
  // rounded to 5 cent: bread at 2,49 makes 8,54, paid as 8,55
  const rounded = register({ cashRounding: "5", items: serializeItems(defaultItems().map((i) => (i.code === "102" ? { ...i, price: 249 } : i))) });
  assert.deepEqual([rounded.register!.value, rounded.price, rounded.asked], [854, 855, 145]);
  // without rounding the change of 1,46 needs a 1 cent coin the euro does not offer
  const unrounded = register({ items: serializeItems(defaultItems().map((i) => (i.code === "102" ? { ...i, price: 249 } : i))) });
  assert.deepEqual(settingsProblems(unrounded), ["cannotChange"]);
  assert.equal(correctFor(unrounded), undefined);
});

test("the register's problems", () => {
  assert.deepEqual(settingsProblems(register({ given: "5" })), ["givenTooLittle"]);
  assert.deepEqual(settingsProblems(register({ given: "" })), ["noGiven"]);
  assert.deepEqual(settingsProblems(register({ items: '[{"price": 0}]' })), ["badItems"]);
  const twice: ShopItem[] = [defaultItems()[0], { ...defaultItems()[1], code: "101" }];
  assert.deepEqual(settingsProblems(register({ items: serializeItems(twice) })), ["duplicateCode"]);
  // the authoring mode: the shopping is its business, and so is the change it causes
  assert.deepEqual(authoringProblems({ task: "register", given: "5" }, defaultItemsPieces()), ["givenTooLittle"]);
  assert.deepEqual(authoringProblems({ task: "change", amount: "12", given: "10" }, defaultItemsPieces()), []);
});
const defaultItemsPieces = () => taskFrom({}).pieces;

test("the keys: typing, ×, Code, a tap, Price, C and Correction", () => {
  const model = register();
  const ctx = tillContext(model);
  let till = type(emptyTill, ctx, "1", "2", "sep", "sep", "5", "0", "0");
  assert.equal(till.entry, "12.50"); // one separator, two decimals at most
  assert.equal(entryAmount(till.entry), 1250);
  till = pressKey(till, "back", ctx);
  assert.equal(till.entry, "12.5");
  till = pressKey(till, "clear", ctx);
  assert.equal(till.entry, "");
  // a tap rings one up
  till = ring(till, "101", ctx);
  assert.deepEqual(till.lines, [{ code: "101", price: 115, quantity: 1 }]);
  // 3 × and a tap: three
  till = ring(type(till, ctx, "3", "times"), "103", ctx);
  assert.equal(rungUp(till, "103"), 3);
  assert.equal(till.times, null);
  // a code
  till = type(till, ctx, "102", "code");
  assert.equal(rungUp(till, "102"), 1);
  till = type(till, ctx, "999", "code");
  assert.deepEqual(till.note, { key: "unknownCode", detail: "999" });
  assert.equal(till.lines.length, 3);
  till = pressKey(till, "code", ctx);
  assert.deepEqual(till.note, { key: "typeCode" });
  // the second milk: the deal is for both, rung up one by one
  till = ring(till, "101", ctx);
  assert.equal(linesValue(till.lines, ctx.items), 200 + 135 + 245);
  // a quantity must be 1 to 99
  assert.deepEqual(type(till, ctx, "0", "times").note, { key: "notAQuantity" });
  assert.deepEqual(type(till, ctx, "1.5", "times").note, { key: "notAQuantity" });
  // an amount typed with Price: a line of its own
  till = type(till, ctx, "2.7", "price");
  assert.deepEqual(till.lines[till.lines.length - 1], { code: null, price: 270, quantity: 1 });
  assert.equal(itemsRungUp(till), 7);
  assert.equal(linesValue(till.lines, ctx.items), 850);
  // Correction takes the last line off
  const undone = pressKey(till, "void", ctx);
  assert.equal(undone.lines.length, till.lines.length - 1);
  assert.deepEqual(undone.note, { key: "voidLine", detail: "" });
  assert.deepEqual(pressKey(emptyTill, "void", ctx).note, { key: "nothingToVoid" });
});

test("Total and Cash: the till calculates", () => {
  const model = register();
  const ctx = tillContext(model);
  assert.deepEqual(pressKey(emptyTill, "total", ctx).note, { key: "noLines" });
  let till = emptyTill;
  for (const item of ctx.items) till = ring(type(till, ctx, String(item.quantity), "times"), item.code, ctx);
  assert.deepEqual(type(till, ctx, "10", "cash").note, { key: "totalFirst" });
  till = pressKey(till, "total", ctx);
  assert.equal(till.total, 850);
  assert.equal(phaseOf(till), "total");
  assert.deepEqual(pressKey(till, "cash", ctx).note, { key: "typePaid" });
  assert.deepEqual(type(till, ctx, "5", "cash").note, { key: "tooLittle", detail: 350 });
  till = type(till, ctx, "10", "cash");
  assert.equal(till.paid, 1000);
  assert.equal(phaseOf(till), "paid");
  // Correction undoes the payment, then the total
  assert.equal(phaseOf(pressKey(till, "void", ctx)), "total");
  assert.equal(phaseOf(pressKey(pressKey(till, "void", ctx), "void", ctx)), "ringing");
  // ringing up after the payment opens the sale again
  const again = ring(till, "101", ctx);
  assert.deepEqual([again.total, again.paid, phaseOf(again)], [null, null, "ringing"]);
});

test("Total and Cash: the pupil calculates, the till takes what is keyed in", () => {
  const model = register({ tillCalculates: "false" });
  const ctx = tillContext(model);
  let till = ring(emptyTill, "102", ctx);
  assert.deepEqual(pressKey(till, "total", ctx).note, { key: "typeTotal" });
  till = type(till, ctx, "8.5", "total");
  assert.equal(till.total, 850);
  till = type(till, ctx, "5", "cash"); // too little: the till does not know
  assert.equal(till.paid, 500);
});

test("the receipt: per item all its lines together, the deal and the discount", () => {
  const ctx = tillContext(register());
  let till = ring(emptyTill, "101", ctx);
  till = ring(type(till, ctx, "2.5", "price"), "101", ctx);
  assert.deepEqual(receiptRows(till.lines, ctx.items), [
    { code: "101", name: "Milk", quantity: 2, price: 115, amount: 230, deal: { kind: "multi", count: 2, price: 200 }, value: 200 },
    { code: null, name: null, quantity: 1, price: 250, amount: 250, deal: null, value: 250 },
  ]);
});

/** Everything right: the shopping rung up, Total, the customer's money, Cash, and `change` on the counter. */
function sale(settings: Settings, paid: string, change: Record<number, number>, total?: string) {
  const model = register(settings);
  const ctx = tillContext(model);
  let till = emptyTill;
  for (const item of ctx.items) till = ring(type(till, ctx, String(item.quantity), "times"), item.code, ctx);
  till = total === undefined ? pressKey(till, "total", ctx) : type(till, ctx, total, "total");
  till = type(till, ctx, paid, "cash");
  return { model, till, response: registerResponse(model, till, change) };
}

test("the response: nothing until something is done, then every field", () => {
  const model = register();
  const ctx = tillContext(model);
  assert.equal(registerResponse(model, emptyTill, {}), undefined);
  assert.equal(registerResponse(model, { ...emptyTill, entry: "12" }, {}), undefined); // typing is not an answer yet
  assert.deepEqual(fields(registerResponse(model, ring(emptyTill, "101", ctx), {})), {
    itemsRungUp: 1, itemsTotal: 1.15, total: 0, totalCorrect: false, paid: 0, change: 0, changeCorrect: false, fewest: true, correct: false,
  });
  // the whole sale, the change as € 1 and 50 cent
  const { response } = sale({}, "10", { 100: 1, 50: 1 });
  assert.deepEqual(fields(response), { itemsRungUp: 7, itemsTotal: 8.5, total: 8.5, totalCorrect: true, paid: 10, change: 1.5, changeCorrect: true, fewest: true, correct: true });
  assert.deepEqual(response, correctFor(register()));
  // the change in more pieces than needed: still correct, unless the fewest are asked
  assert.equal(fields(sale({}, "10", { 50: 3 }).response).correct, true);
  assert.deepEqual(fields(sale({ fewestChange: "true" }, "10", { 50: 3 }).response), { ...fields(response), fewest: false, correct: false });
  // a payment keyed in that is not the customer's money
  assert.equal(fields(sale({}, "20", { 100: 1, 50: 1 }).response).correct, false);
});

test("the response when the pupil calculates: their total, the right one or not", () => {
  const right = sale({ tillCalculates: "false" }, "10", { 100: 1, 50: 1 }, "8.50");
  assert.deepEqual(fields(right.response), fields(correctFor(register())));
  const wrong = sale({ tillCalculates: "false" }, "10", { 100: 1, 50: 1, 20: 1 }, "8.30");
  assert.deepEqual(fields(wrong.response), {
    itemsRungUp: 7, itemsTotal: 8.5, total: 8.3, totalCorrect: false, paid: 10, change: 1.7, changeCorrect: false, fewest: true, correct: false,
  });
});

test("the register in every currency: dollars, pounds, a currency of one's own without a minor unit", () => {
  const items: ShopItem[] = [
    { code: "1", name: "Tea", price: 185, quantity: 2, deal: null, look: "jar" },
    { code: "2", name: "Biscuits", price: 90, quantity: 3, deal: { kind: "multi", count: 3, price: 200 }, look: "bag" },
    { code: "3", name: "Jam", price: 240, quantity: 1, deal: { kind: "percent", percent: 50 }, look: "jar" },
  ];
  // 3,70 + 2,00 + 1,20 = 6,90; the change of 3,10 in pounds: £2, £1 and 10p
  const gbp = { currency: "gbp", items: serializeItems(items), fewestChange: "true" };
  const pounds = sale(gbp, "10", { 200: 1, 100: 1, 10: 1 });
  assert.deepEqual(pounds.response, correctFor(register(gbp)));
  assert.equal(fields(sale(gbp, "10", { 100: 3, 10: 1 }).response).correct, false); // not the fewest
  // dollars (no $2 note offered): $3.10 is three $1 notes and a dime
  const usd = sale({ currency: "usd", items: serializeItems(items) }, "10", { 100: 3, 10: 1 });
  assert.deepEqual(fields(usd.response), fields(correctFor(register({ currency: "usd", items: serializeItems(items) }))));
  assert.equal(fields(usd.response).correct, true);
  // kroner without a minor unit: the separator does nothing, prices are whole
  const franc = { currency: "custom", currencySign: "₣", items: serializeItems([{ code: "5", name: "Bread", price: 300, quantity: 2, deal: null, look: "bread" }]) };
  const model = register(franc);
  const ctx = tillContext(model);
  assert.equal(type(emptyTill, ctx, "1", "sep", "2").entry, "12");
  const done = sale(franc, "10", { 200: 2 });
  assert.equal(fields(done.response).correct, true);
  assert.equal(model.asked, 400);
});

test("a response read back: the till and the change", () => {
  const model = register();
  const correct = correctFor(model)!;
  const shown = tillFor(correct, model)!;
  assert.equal(itemsRungUp(shown.till), 7);
  assert.deepEqual(shown.tray, { 100: 1, 50: 1 });
  // shown, it gives the same response
  assert.deepEqual(registerResponse(model, shown.till, shown.tray), correct);
  // another response: the numbers it says, as amounts
  const other = { record: [{ name: "itemsRungUp", base: { integer: 3 } }, { name: "itemsTotal", base: { float: 4.2 } }, { name: "total", base: { float: 4.2 } }, { name: "paid", base: { float: 0 } }, { name: "change", base: { float: 0 } }] };
  const back = tillFor(other, model)!;
  assert.deepEqual(fields(registerResponse(model, back.till, back.tray)), {
    itemsRungUp: 3, itemsTotal: 4.2, total: 4.2, totalCorrect: false, paid: 0, change: 0, changeCorrect: false, fewest: true, correct: false,
  });
  assert.equal(tillFor({ base: { float: 3 } }, model), null);
});

test("a saved till: an older state has none, a broken one is cleaned", () => {
  assert.deepEqual(tillOf(undefined), emptyTill);
  assert.deepEqual(tillOf({ lines: [{ code: "101", price: 115, quantity: 0 }, { code: null, price: 5, quantity: 2 }], total: "x" }), {
    ...emptyTill,
    lines: [{ code: null, price: 5, quantity: 2 }],
  });
});
