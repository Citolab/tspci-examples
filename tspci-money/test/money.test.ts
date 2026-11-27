// npm test: currencies, amounts, totals, the fewest coins and notes (also with a limited supply), change, the response
// and the correct response of the money PCI (src/money.ts), in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EUR, PRESET_CURRENCIES, amountText, authoringProblems, clean, correctFor, currencyFrom, defaultPieces, faceValue, fewestPieces, formatAmount,
  isFewest, left, minPieces, newPiece, parseAmount, parsePieceDefs, parsePieces, pieceCount, piecesOf, piecesProblems, pileFor, readResponse,
  responseFor, serializePieces, settingsProblems, supplyOf, taskFrom, toMajor, totalOf, type PieceDef, type Supply,
} from "../src/money.ts";

const USD = PRESET_CURRENCIES.usd;
const GBP = PRESET_CURRENCIES.gbp;

/** A supply as the old text setting wrote it: "3x 2; 1; 0,50" (a count in front limits one), large to small. */
function stocks(text: string): Supply {
  const limits = new Map<number, number | null>();
  for (const part of text.split(";")) {
    const match = /^\s*(?:(\d+)\s*x\s*)?(.+)$/.exec(part)!;
    const value = parseAmount(match[2])!;
    const before = limits.get(value);
    limits.set(value, match[1] === undefined || before === null ? null : (before ?? 0) + Number(match[1]));
  }
  return [...limits].map(([value, limit]) => ({ value, limit })).sort((a, b) => b.value - a.value);
}
/** The `pieces` setting for a supply: every value offered, with its count. */
const piecesSetting = (text: string) => serializePieces(stocks(text).map(({ value, limit }) => ({ ...newPiece(value, EUR), count: limit })));

const everything: Supply = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].reverse().map((value) => ({ value, limit: null }));
const dutch = supplyOf(defaultPieces(EUR));

test("parseAmount: euros and cents as an author or a candidate writes them", () => {
  assert.equal(parseAmount("7,35"), 735);
  assert.equal(parseAmount("7.35"), 735);
  assert.equal(parseAmount("€ 7,35"), 735);
  assert.equal(parseAmount("€7.35"), 735);
  assert.equal(parseAmount(" 7 "), 700);
  assert.equal(parseAmount("7,-"), 700);
  assert.equal(parseAmount("0,5"), 50);
  assert.equal(parseAmount("0,05"), 5);
  assert.equal(parseAmount("10 euro"), 1000);
  assert.equal(parseAmount("1234,56"), 123456);
  assert.equal(parseAmount("35 cent"), 35);
  for (const bad of ["", "abc", "7,355", "-3", "1.200,00", "7,3,5", "€", ",50", "$7.35", "35p"]) assert.equal(parseAmount(bad), null, bad);
});

test("parseAmount: dollars and cents, pounds and pence", () => {
  for (const [text, cents] of [["$7.35", 735], ["7.35", 735], ["7,35", 735], ["$ 7", 700], ["35¢", 35], ["35c", 35], ["35 cents", 35], ["0.35", 35], ["10 dollars", 1000], ["USD 5", 500]] as const)
    assert.equal(parseAmount(text, USD), cents, text);
  for (const [text, cents] of [["£7.35", 735], ["7,35", 735], ["35p", 35], ["35 p", 35], ["1 penny", 1], ["20 pence", 20], ["£0.50", 50], ["5 pounds", 500]] as const)
    assert.equal(parseAmount(text, GBP), cents, text);
  for (const bad of ["€7.35", "35p", "7.355"]) assert.equal(parseAmount(bad, USD), null, bad);
  for (const bad of ["$7.35", "35¢", "35.5p"]) assert.equal(parseAmount(bad, GBP), null, bad);
});

test("parseAmount: a currency of the author's own, with or without a minor unit", () => {
  const krone = currencyFrom({ currency: "custom", currencySign: "kr", currencyPosition: "after", minorUnit: "øre" });
  assert.equal(parseAmount("7,35 kr", krone), 735);
  assert.equal(parseAmount("7,35kr", krone), 735);
  assert.equal(parseAmount("KR 7", krone), 700);
  assert.equal(parseAmount("50 øre", krone), 50);
  assert.equal(parseAmount("50 ØRE", krone), 50);
  assert.equal(parseAmount("€ 7", krone), null);
  const real = currencyFrom({ currency: "custom", currencySign: "R$", currencyPosition: "before", minorUnit: "centavos" });
  assert.equal(parseAmount("R$ 7,35", real), 735);
  assert.equal(parseAmount("R$7.35", real), 735); // the $ in the sign is not a pattern
  assert.equal(parseAmount("35 centavos", real), 35);
  const franc = currencyFrom({ currency: "custom", currencySign: "₣", minorUnit: "" });
  assert.equal(parseAmount("₣ 12", franc), 1200);
  assert.equal(parseAmount("12,-", franc), 1200);
  assert.equal(parseAmount("12,00", franc), 1200);
  assert.equal(parseAmount("12,50", franc), null); // no minor unit: only whole amounts
});

test("formatAmount: € 7,35 in Dutch, €7.35 in English", () => {
  assert.equal(formatAmount(735, "nl"), "€ 7,35");
  assert.equal(formatAmount(735, "en"), "€7.35");
  assert.equal(formatAmount(1000, "nl"), "€ 10,00");
  assert.equal(formatAmount(5, "en"), "€0.05");
  assert.equal(amountText(735, "nl"), "7,35");
  assert.equal(amountText(735, "en"), "7.35");
});

test("formatAmount: each currency in its own way", () => {
  assert.equal(formatAmount(735, "en", USD), "$7.35");
  assert.equal(formatAmount(735, "nl", USD), "$ 7,35");
  assert.equal(formatAmount(35, "en", USD), "35¢");
  assert.equal(formatAmount(35, "nl", USD), "35¢");
  assert.equal(formatAmount(100, "en", USD), "$1.00");
  assert.equal(formatAmount(735, "en", GBP), "£7.35");
  assert.equal(formatAmount(35, "en", GBP), "35p");
  assert.equal(amountText(35, "en", GBP), "0.35"); // in the answer box, next to the £
  const krone = currencyFrom({ currency: "custom", currencySign: "kr", currencyPosition: "after", minorUnit: "øre" });
  assert.equal(formatAmount(735, "nl", krone), "7,35 kr");
  assert.equal(formatAmount(735, "en", krone), "7.35 kr");
  assert.equal(formatAmount(35, "nl", krone), "0,35 kr");
  const real = currencyFrom({ currency: "custom", currencySign: "R$", minorUnit: "centavos" });
  assert.equal(formatAmount(735, "nl", real), "R$ 7,35");
  assert.equal(formatAmount(735, "en", real), "R$7.35");
  assert.equal(formatAmount(735, "en", currencyFrom({ currency: "custom", currencySign: "CHF", minorUnit: "Rp." })), "CHF 7.35");
  const franc = currencyFrom({ currency: "custom", currencySign: "₣" });
  assert.equal(formatAmount(1200, "nl", franc), "₣ 12");
  assert.equal(formatAmount(1200, "en", franc), "₣12");
});

test("faceValue: what a coin or note says, language neutral", () => {
  assert.deepEqual(faceValue(50), ["50", "CENT", "c"]);
  assert.deepEqual(faceValue(200), ["2", "EURO", "€"]);
  assert.deepEqual(faceValue(1, USD), ["1", "CENT", "¢"]);
  assert.deepEqual(faceValue(25, USD), ["25", "CENTS", "¢"]);
  assert.deepEqual(faceValue(2000, USD), ["20", "DOLLARS", "$"]);
  assert.deepEqual(faceValue(1, GBP), ["1", "PENNY", "p"]);
  assert.deepEqual(faceValue(100, GBP), ["1", "POUND", "£"]);
  assert.deepEqual(faceValue(250), ["2.50", "EURO", "€"]);
  const krone = currencyFrom({ currency: "custom", currencySign: "kr", minorUnit: "øre" });
  assert.deepEqual(faceValue(50, krone), ["50", "øre", "øre"]);
  assert.deepEqual(faceValue(1000, krone), ["10", "kr", "kr"]);
});

test("toMajor: the float of the response is the decimal amount", () => {
  assert.equal(toMajor(735), 7.35);
  assert.equal(toMajor(10), 0.1);
  assert.equal(toMajor(30), 0.3); // not 0.30000000000000004
  assert.equal(toMajor(10 + 20), 0.3);
});

test("parsePieces: a list of coins and notes with counts, of the currency", () => {
  assert.deepEqual(parsePieces("10; 2x 2; 0,50; 3 × 0,20; 0,05").counts, { 1000: 1, 200: 2, 50: 1, 20: 3, 5: 1 });
  assert.deepEqual(parsePieces("2; 2; 3*2").counts, { 200: 5 });
  const { counts, invalid } = parsePieces("10; 3; 0,25; abc; 500");
  assert.deepEqual(counts, { 1000: 1 });
  assert.deepEqual(invalid, ["3", "0,25", "abc", "500"]); // no € 3, 25 cent or € 500
  // the coins and notes of the currency, offered or not: 1 cent is not offered, but the customer can pay with it
  assert.deepEqual(parsePieces("0,01").counts, { 1: 1 });
  assert.deepEqual(parsePieces("2x 25¢; $1; 0,10", USD, defaultPieces(USD)).counts, { 25: 2, 100: 1, 10: 1 });
  assert.deepEqual(parsePieces("50p; 2x £2; 0,20", GBP, defaultPieces(GBP)).counts, { 50: 1, 200: 2, 20: 1 });
  assert.deepEqual(parsePieces("0,25", GBP, defaultPieces(GBP)).invalid, ["0,25"]);
});

test("totals and pieces", () => {
  const pile = { 500: 1, 200: 1, 20: 1, 10: 1, 5: 1 };
  assert.equal(totalOf(pile), 735);
  assert.equal(pieceCount(pile), 5);
  assert.deepEqual(piecesOf({ 5: 1, 200: 2 }), [200, 200, 5]);
  assert.deepEqual(clean({ 5: 1, 200: 0, 1000: 2 }), { 1000: 2, 5: 1 });
});

test("the presets: their coins and notes, and which are offered", () => {
  const offered = (defs: PieceDef[]) => supplyOf(defs).map((s) => s.value);
  const kinds = (defs: PieceDef[], kind: string) => defs.filter((d) => d.kind === kind).map((d) => d.value);
  // euro: everything from 1 cent to € 200; no 1 and 2 cent and nothing above € 50 offered
  const eur = defaultPieces(EUR);
  assert.deepEqual(kinds(eur, "coin"), [1, 2, 5, 10, 20, 50, 100, 200]);
  assert.deepEqual(kinds(eur, "note"), [500, 1000, 2000, 5000, 10000, 20000]);
  assert.deepEqual(offered(eur), [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5]);
  assert.equal(eur.find((d) => d.value === 100)!.color, "silverInGold");
  assert.equal(eur.find((d) => d.value === 200)!.color, "goldInSilver");
  // dollar: no 50 cent coin, $1 coin and $2 note offered; $1 is a note
  const usd = defaultPieces(USD);
  assert.deepEqual(kinds(usd, "coin"), [1, 5, 10, 25, 50]);
  assert.deepEqual(kinds(usd, "note"), [100, 200, 500, 1000, 2000, 5000, 10000]);
  assert.deepEqual(offered(usd), [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1]);
  // pound: everything offered
  const gbp = defaultPieces(GBP);
  assert.deepEqual(kinds(gbp, "coin"), [1, 2, 5, 10, 20, 50, 100, 200]);
  assert.deepEqual(kinds(gbp, "note"), [500, 1000, 2000, 5000]);
  assert.equal(offered(gbp).length, 12);
  assert.ok([...eur, ...usd, ...gbp].every((d) => d.count === null));
  // a copy: changing one does not change the preset
  eur[0].offered = true;
  assert.equal(defaultPieces(EUR)[0].offered, false);
});

test("parsePieceDefs: the pieces setting, with defaults for what is left out", () => {
  assert.deepEqual(parsePieceDefs("", EUR), defaultPieces(EUR));
  assert.deepEqual(parsePieceDefs("not json", USD), defaultPieces(USD));
  assert.deepEqual(parsePieceDefs("[]", GBP), defaultPieces(GBP));
  const defs = parsePieceDefs(
    JSON.stringify([
      { value: 200, count: 3 },
      { value: 25, kind: "note", color: "#ABCDEF" },
      { value: 100, kind: "coin", color: "gold", offered: false },
      { value: 200, count: 1 }, // twice: the first one counts
      { value: -5 },
      { value: 1.5 },
      { value: 5, color: "nonsense", count: "x" },
      { value: 1000, kind: "note", color: "gold" }, // a metal is not a note's colour
    ]),
    EUR
  );
  assert.deepEqual(defs, [
    { value: 5, kind: "coin", color: "copper", offered: true, count: null },
    { value: 25, kind: "note", color: "#abcdef", offered: true, count: null },
    { value: 100, kind: "coin", color: "gold", offered: false, count: null },
    { value: 200, kind: "coin", color: "goldInSilver", offered: true, count: 3 },
    { value: 1000, kind: "note", color: "#d9675e", offered: true, count: null },
  ]);
  // written and read back: the same
  assert.deepEqual(parsePieceDefs(serializePieces(defs), EUR), defs);
  // the $1 as a coin: gold
  assert.deepEqual(parsePieceDefs('[{"value":100,"kind":"coin"}]', USD)[0].color, "gold");
});

test("the currency from the settings", () => {
  assert.equal(currencyFrom({}), EUR);
  assert.equal(currencyFrom({ currency: "usd" }), USD);
  assert.equal(currencyFrom({ currency: "nonsense" }), EUR);
  assert.deepEqual(currencyFrom({ currency: "custom", currencySign: " kr ", currencyPosition: "after", minorUnit: "øre" }), {
    code: "custom", sign: "kr", position: "after", minor: "øre",
  });
  assert.deepEqual(currencyFrom({ currency: "custom" }), { code: "custom", sign: "", position: "before", minor: "" });
  // a currency of the author's own starts with a 1, 2, 5 series: from the minor unit, or from 1 without one
  assert.equal(defaultPieces(currencyFrom({ currency: "custom", minorUnit: "øre" }))[0].value, 1);
  assert.ok(defaultPieces(currencyFrom({ currency: "custom" })).every((d) => d.value % 100 === 0));
});

test("supply and limits", () => {
  const limited = stocks("2x 2; 1; 3x 0,50; 2x 2");
  assert.deepEqual(limited, [{ value: 200, limit: 4 }, { value: 100, limit: null }, { value: 50, limit: 3 }]);
  assert.deepEqual(supplyOf([{ ...newPiece(200, EUR), count: 4 }, { ...newPiece(50, EUR), count: 0 }, { ...newPiece(10, EUR), offered: false }]), [{ value: 200, limit: 4 }]);
  assert.equal(left(limited, { 200: 3 }, 200), 1);
  assert.equal(left(limited, { 200: 3 }, 100), Infinity);
  assert.equal(left(limited, {}, 500), 0);
});

test("fewestPieces: the euro, with every coin and note", () => {
  assert.deepEqual(fewestPieces(735, everything), { 500: 1, 200: 1, 20: 1, 10: 1, 5: 1 });
  assert.deepEqual(fewestPieces(265, everything), { 200: 1, 50: 1, 10: 1, 5: 1 });
  assert.deepEqual(fewestPieces(88, everything), { 50: 1, 20: 1, 10: 1, 5: 1, 2: 1, 1: 1 });
  assert.deepEqual(fewestPieces(0, everything), {});
  // € 999,99: 500 + 2 × 200 + 50 + 2 × 20 + 5 + 2 × 2, and 50 + 2 × 20 + 5 + 2 × 2 cent
  assert.equal(minPieces(99999, everything), 15);
});

test("fewestPieces: without 1 and 2 cent (Dutch practice), and limited", () => {
  assert.equal(fewestPieces(733, dutch), null); // can not be paid exactly
  assert.deepEqual(fewestPieces(735, dutch), { 500: 1, 200: 1, 20: 1, 10: 1, 5: 1 });
  // only coins
  assert.deepEqual(fewestPieces(735, stocks("0,05; 0,10; 0,20; 0,50; 1; 2")), { 200: 3, 100: 1, 20: 1, 10: 1, 5: 1 });
  // without 10 cent, 60 cent is three times 20, not 50 and something
  assert.deepEqual(fewestPieces(60, stocks("0,20; 0,50")), { 20: 3 });
  // a limited supply: only one € 2
  assert.deepEqual(fewestPieces(400, stocks("1x 2; 1")), { 200: 1, 100: 2 });
  // not enough money in the supply
  assert.equal(fewestPieces(400, stocks("1x 2; 1x 1")), null);
  // a non-canonical supply where the largest first is not the fewest: 30 = 3 × 10 is not better than 20 + 10
  assert.deepEqual(fewestPieces(30, stocks("0,20; 0,10")), { 20: 1, 10: 1 });
  assert.deepEqual(fewestPieces(80, stocks("0,50; 0,20")), { 20: 4 }); // 50 + 20 + ? does not work
  assert.deepEqual(fewestPieces(90, stocks("0,50; 0,20")), { 50: 1, 20: 2 });
});

/** The fewest pieces by counting every amount up from 0 (slow, but sure), to check the search against. */
function bruteForce(amount: number, supply: Supply): number | null {
  // each piece once: a 0/1 knapsack over the pieces of the supply (limits made explicit, at most enough for amount)
  const pieces = supply.flatMap((s) => Array<number>(Math.min(s.limit ?? Infinity, Math.floor(amount / s.value))).fill(s.value));
  const best = Array<number>(amount + 1).fill(Infinity);
  best[0] = 0;
  for (const piece of pieces) for (let v = amount; v >= piece; v--) best[v] = Math.min(best[v], best[v - piece] + 1);
  return best[amount] === Infinity ? null : best[amount];
}

test("fewestPieces agrees with counting everything, for many supplies and amounts", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let round = 0; round < 300; round++) {
    const supply: Supply = [1, 2, 5, 10, 20, 50, 100, 200, 500]
      .filter(() => random() < 0.6)
      .map((value) => ({ value, limit: random() < 0.5 ? null : Math.floor(random() * 4) }))
      .filter((s) => s.limit !== 0)
      .sort((a, b) => b.value - a.value);
    const amount = 1 + Math.floor(random() * 1200);
    const found = fewestPieces(amount, supply);
    const expected = bruteForce(amount, supply);
    assert.equal(found ? pieceCount(found) : null, expected, `${amount} with ${JSON.stringify(supply)}`);
    if (found) {
      assert.equal(totalOf(found), amount);
      for (const [value, count] of Object.entries(found)) {
        const stock = supply.find((s) => s.value === Number(value))!;
        assert.ok(stock.limit === null || count <= stock.limit);
      }
    }
  }
});

test("fewestPieces: large amounts stay fast", () => {
  const start = Date.now();
  // € 1234,40 without 10 cent and € 1: 24 × 50 + 20 + 2 × 5 + 2 × 2 and 2 × 20 cent (€ 0,40 is two coins of 20)
  assert.equal(minPieces(123440, stocks("0,20; 0,50; 2; 5; 20; 50")), 24 + 1 + 2 + 2 + 2);
  assert.equal(minPieces(123455, stocks("0,20; 0,50; 2; 5; 20; 50")), null); // 5 cent can not be made
  // one € 500 note, the rest in 2 and 1 cent: 24999 × 2 cent and 1 cent
  assert.equal(minPieces(99999, stocks("1x 500; 0,01; 0,02")), 1 + 24999 + 1);
  assert.ok(Date.now() - start < 2000, `${Date.now() - start} ms`);
});

test("isFewest: for the amount on the counter, with the supply", () => {
  assert.equal(isFewest({ 500: 1, 200: 1, 20: 1, 10: 1, 5: 1 }, dutch), true);
  assert.equal(isFewest({ 200: 3, 100: 1, 20: 1, 10: 1, 5: 1 }, dutch), false);
  assert.equal(isFewest({ 200: 3, 100: 1, 20: 1, 10: 1, 5: 1 }, stocks("0,05; 0,10; 0,20; 0,50; 1; 2")), true);
  // a wrong amount in the fewest pieces is still fewest (for that amount)
  assert.equal(isFewest({ 500: 1, 200: 1, 20: 1, 10: 1 }, dutch), true);
  assert.equal(isFewest({}, dutch), false);
});

test("the task: pay, change and count", () => {
  assert.equal(taskFrom({ task: "pay", amount: "7,35" }).asked, 735);
  assert.equal(taskFrom({ task: "fewest", amount: "€ 12,50" }).asked, 1250);
  const change = taskFrom({ task: "change", amount: "7,35", given: "10" });
  assert.equal(change.asked, 265);
  assert.deepEqual(change.given, { 1000: 1 });
  assert.equal(taskFrom({ task: "changeFewest", amount: "3,65", given: "5; 2x 0,50" }).asked, 235);
  assert.equal(taskFrom({ task: "count", countPieces: "10; 2x 2; 0,50; 3x 0,20; 0,05" }).asked, 1515);
  assert.equal(taskFrom({ task: "nonsense", amount: "1" }).task, "pay");
  // what the author must fix
  assert.deepEqual(settingsProblems(taskFrom({ task: "pay", amount: "" })), ["noAmount"]);
  assert.deepEqual(settingsProblems(taskFrom({ task: "change", amount: "12", given: "10" })), ["givenTooLittle"]);
  assert.deepEqual(settingsProblems(taskFrom({ task: "change", amount: "2", given: "" })), ["noGiven"]);
  assert.deepEqual(settingsProblems(taskFrom({ task: "count", countPieces: "" })), ["noCounter"]);
  assert.deepEqual(settingsProblems(taskFrom({ task: "pay", amount: "7,33", pieces: piecesSetting("0,05; 0,10; 1; 2") })), ["cannotPay"]);
  assert.deepEqual(settingsProblems(taskFrom({ task: "pay", amount: "7,35" })), []);
});

test("the task in other currencies: amounts, the customer's money and the fewest with the configured coins and notes", () => {
  // dollars: $7.35 is $5, 2 × $1, 25¢ and 10¢
  const usd = taskFrom({ currency: "usd", task: "fewest", amount: "$7.35" });
  assert.equal(usd.asked, 735);
  assert.deepEqual(fewestPieces(usd.asked!, usd.supply), { 500: 1, 100: 2, 25: 1, 10: 1 });
  assert.deepEqual(settingsProblems(usd), []);
  // without the 5 cent coin, 30¢ is three dimes, not a quarter and five pennies
  const noNickel = defaultPieces(USD).map((d) => (d.value === 5 ? { ...d, offered: false } : d));
  const dimes = taskFrom({ currency: "usd", task: "fewest", amount: "30¢", pieces: serializePieces(noNickel) });
  assert.deepEqual(fewestPieces(30, dimes.supply), { 10: 3 });
  assert.deepEqual(fields(correctFor(dimes)), { amount: 0.3, exact: true, pieces: 3, fewest: true });
  // the $1 coin switched on next to the $1 note is one value: the $1 is a coin now
  const coinDollar = taskFrom({ currency: "usd", task: "count", countPieces: "$1; 2x 25¢", pieces: '[{"value":100,"kind":"coin"},{"value":25}]' });
  assert.deepEqual(coinDollar.counter, { 100: 1, 25: 2 });
  assert.equal(coinDollar.pieces[1].kind, "coin");
  // pounds: change from £10 for £6.45, in as few as possible: £2, £1, 50p, 5p
  const gbp = taskFrom({ currency: "gbp", task: "changeFewest", amount: "£6.45", given: "10" });
  assert.equal(gbp.asked, 355);
  assert.deepEqual(fewestPieces(355, gbp.supply), { 200: 1, 100: 1, 50: 1, 5: 1 });
  // limited: only one £2 and two £1, so £5.00 in coins is £2, 2 × £1 and 2 × 50p
  const limited = defaultPieces(GBP).map((d) => (d.value === 200 ? { ...d, count: 1 } : d.value === 100 ? { ...d, count: 2 } : d.kind === "note" ? { ...d, offered: false } : d));
  const purse = taskFrom({ currency: "gbp", task: "fewest", amount: "5", pieces: serializePieces(limited) });
  assert.deepEqual(fewestPieces(500, purse.supply), { 200: 1, 100: 2, 50: 2 });
  assert.deepEqual(fields(correctFor(purse)), { amount: 5, exact: true, pieces: 5, fewest: true });
  // the response: in pounds, as a float
  assert.deepEqual(fields(responseFor(purse, { 200: 1, 100: 2, 50: 2 }, "")), { amount: 5, exact: true, pieces: 5, fewest: true });
  // the count task: the answer box takes the currency's forms
  const count = taskFrom({ currency: "gbp", task: "count", countPieces: "2x 20p; 5p" });
  assert.deepEqual(fields(responseFor(count, {}, "45p")), { answer: 0.45, exact: true });
  assert.deepEqual(fields(responseFor(count, {}, "£0.45")), { answer: 0.45, exact: true });
  assert.equal(responseFor(count, {}, "45¢"), undefined);
});

test("the task in a currency of the author's own", () => {
  const krone = { currency: "custom", currencySign: "kr", currencyPosition: "after", minorUnit: "øre" };
  const pieces = serializePieces([
    { value: 50, kind: "coin", color: "copper", offered: true, count: null },
    { value: 100, kind: "coin", color: "silver", offered: true, count: null },
    { value: 500, kind: "coin", color: "#335577", offered: true, count: null },
    { value: 2000, kind: "coin", color: "goldInSilver", offered: true, count: null },
    { value: 5000, kind: "note", color: "#d9675e", offered: true, count: null },
  ]);
  const task = taskFrom({ ...krone, pieces, task: "changeFewest", amount: "27,50 kr", given: "50" });
  assert.equal(task.asked, 2250);
  assert.deepEqual(fewestPieces(2250, task.supply), { 2000: 1, 100: 2, 50: 1 });
  assert.deepEqual(settingsProblems(task), []);
  assert.deepEqual(settingsProblems(taskFrom({ ...krone, pieces, task: "pay", amount: "7,25" })), ["cannotPay"]);
  // no sign: the author must give one
  assert.deepEqual(settingsProblems(taskFrom({ currency: "custom", task: "pay", amount: "7" })), ["noSign"]);
  // without a minor unit: whole amounts
  const franc = taskFrom({ currency: "custom", currencySign: "₣", task: "fewest", amount: "37" });
  assert.equal(franc.asked, 3700);
  assert.deepEqual(fewestPieces(3700, franc.supply), { 2000: 1, 1000: 1, 500: 1, 200: 1 });
  assert.deepEqual(fields(correctFor(franc)), { amount: 37, exact: true, pieces: 4, fewest: true });
});

test("problems of the coins and notes, for the authoring mode", () => {
  const eur = defaultPieces(EUR);
  assert.deepEqual(piecesProblems(eur, EUR), []);
  assert.deepEqual(piecesProblems(eur.map((d) => ({ ...d, offered: false })), EUR), ["noPieces"]);
  assert.deepEqual(piecesProblems(eur.map((d) => ({ ...d, count: 0 })), EUR), ["noPieces"]);
  assert.deepEqual(piecesProblems(eur.map((d) => ({ ...d, offered: false })), EUR, "count"), []); // count: the pupil takes nothing
  assert.deepEqual(piecesProblems([...eur, newPiece(200, EUR)], EUR), ["duplicate"]);
  const noMinor = currencyFrom({ currency: "custom", currencySign: "₣" });
  assert.deepEqual(piecesProblems([newPiece(50, noMinor), newPiece(100, noMinor)], noMinor), ["badValue"]);
  assert.deepEqual(piecesProblems(defaultPieces(noMinor), currencyFrom({ currency: "custom" })), ["noSign"]);

  // with the task: the amount can not be paid, or the task's money is not a coin or note of the list
  const settings = { task: "pay", amount: "7,33" };
  assert.deepEqual(authoringProblems(settings, eur), ["cannotPay"]);
  assert.deepEqual(authoringProblems(settings, eur.map((d) => (d.value <= 2 ? { ...d, offered: true } : d))), []);
  assert.deepEqual(authoringProblems({ task: "change", amount: "7,35", given: "10" }, eur.filter((d) => d.value !== 1000)), ["unknownPieces"]);
  assert.deepEqual(authoringProblems({ task: "count", countPieces: "10; 0,25" }, eur), ["unknownPieces"]);
  assert.deepEqual(authoringProblems({ task: "pay", amount: "" }, eur), []); // no amount: not a problem of the coins and notes
  assert.deepEqual(authoringProblems({ currency: "usd", task: "pay", amount: "7,35" }, defaultPieces(USD)), []);
  assert.deepEqual(authoringProblems({ currency: "custom", task: "pay", amount: "7" }, []), ["noSign", "noPieces"]);
  assert.deepEqual(authoringProblems({ task: "pay", amount: "3" }, [{ ...newPiece(200, EUR), count: 1 }, { ...newPiece(200, EUR), count: 1 }]), ["duplicate", "cannotPay"]);
});

const fields = (response: unknown) =>
  Object.fromEntries(((response as { record?: { name: string; base: Record<string, unknown> }[] })?.record ?? []).map((f) => [f.name, Object.values(f.base)[0]]));
const names = (response: unknown) => ((response as { record?: { name: string }[] })?.record ?? []).map((f) => f.name);

test("the response: nothing until answered, then the fields of the task", () => {
  const pay = taskFrom({ task: "pay", amount: "7,35", pieces: piecesSetting("0,05; 0,10; 0,20; 0,50; 1; 2; 5; 10") });
  assert.equal(responseFor(pay, {}, ""), undefined);
  assert.equal(responseFor(pay, { 200: 0 }, ""), undefined);
  assert.deepEqual(fields(responseFor(pay, { 200: 3, 100: 1, 20: 1, 10: 1, 5: 1 }, "")), { amount: 7.35, exact: true });
  assert.deepEqual(fields(responseFor(pay, { 500: 1, 200: 1 }, "")), { amount: 7, exact: false });

  const fewest = taskFrom({ task: "fewest", amount: "7,35", pieces: piecesSetting("0,05; 0,10; 0,20; 0,50; 1; 2; 5; 10") });
  assert.deepEqual(names(responseFor(fewest, { 500: 1 }, "")), ["amount", "exact", "pieces", "fewest"]);
  assert.deepEqual(fields(responseFor(fewest, { 200: 3, 100: 1, 20: 1, 10: 1, 5: 1 }, "")), { amount: 7.35, exact: true, pieces: 7, fewest: false });
  assert.deepEqual(fields(responseFor(fewest, { 500: 1, 200: 1, 20: 1, 10: 1, 5: 1 }, "")), { amount: 7.35, exact: true, pieces: 5, fewest: true });

  const change = taskFrom({ task: "changeFewest", amount: "7,35", given: "10" });
  assert.deepEqual(fields(responseFor(change, { 200: 1, 50: 1, 10: 1, 5: 1 }, "")), { amount: 2.65, exact: true, pieces: 4, fewest: true });
  assert.deepEqual(fields(responseFor(change, { 100: 2, 50: 1, 10: 1, 5: 1 }, "")), { amount: 2.65, exact: true, pieces: 5, fewest: false });

  const count = taskFrom({ task: "count", countPieces: "10; 2x 2; 0,50; 3x 0,20; 0,05" });
  assert.equal(responseFor(count, {}, ""), undefined);
  assert.equal(responseFor(count, {}, "veel"), undefined);
  assert.deepEqual(fields(responseFor(count, {}, "15,15")), { answer: 15.15, exact: true });
  assert.deepEqual(fields(responseFor(count, {}, "€ 15.10")), { answer: 15.1, exact: false });
});

test("the correct response from the settings matches a correct answer, field for field", () => {
  const cases: [Record<string, string>, Record<string, number>, string][] = [
    [{ task: "pay", amount: "7,35" }, { 200: 3, 100: 1, 20: 1, 10: 1, 5: 1 }, ""],
    [{ task: "fewest", amount: "7,35" }, { 500: 1, 200: 1, 20: 1, 10: 1, 5: 1 }, ""],
    [{ task: "change", amount: "7,35", given: "10" }, { 100: 2, 50: 1, 10: 1, 5: 1 }, ""],
    [{ task: "changeFewest", amount: "7,35", given: "10" }, { 200: 1, 50: 1, 10: 1, 5: 1 }, ""],
    [{ task: "count", countPieces: "10; 2x 2; 0,50; 3x 0,20; 0,05" }, {}, "15,15"],
  ];
  for (const [settings, tray, answer] of cases) {
    const model = taskFrom(settings);
    assert.deepEqual(responseFor(model, tray, answer), correctFor(model), settings.task);
  }
  assert.equal(correctFor(taskFrom({ task: "pay", amount: "" })), undefined);
  assert.equal(correctFor(taskFrom({ task: "pay", amount: "7,33", pieces: piecesSetting("0,05; 0,10; 1; 2") })), undefined);
  assert.equal(correctFor(taskFrom({ task: "change", amount: "12", given: "10" })), undefined);
  assert.equal(correctFor(taskFrom({ task: "change", amount: "10", given: "10" })), undefined); // no change to give
});

test("reading a response back: a record, a field, a plain number", () => {
  assert.deepEqual(readResponse({ record: [{ name: "amount", base: { float: 7.35 } }, { name: "pieces", base: { integer: 5 } }] }), { cents: 735, pieces: 5 });
  assert.deepEqual(readResponse({ record: [{ name: "answer", base: { float: 15.15 } }] }), { cents: 1515, pieces: null });
  assert.deepEqual(readResponse({ base: { float: 2.65 } }), { cents: 265, pieces: null });
  assert.deepEqual(readResponse([{ base: { float: 0.3 } }]), { cents: 30, pieces: null });
  assert.deepEqual(readResponse("7.35"), { cents: 735, pieces: null });
  assert.deepEqual(readResponse(undefined), { cents: null, pieces: null });
  assert.deepEqual(pileFor(735, dutch), { 500: 1, 200: 1, 20: 1, 10: 1, 5: 1 });
  assert.equal(pileFor(733, dutch), null);
});
