// npm test: the items, the jobs, dressing the worker, the response and the correct response of the protective
// equipment PCI (src/equipment.ts), in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HAZARDS, ITEMS, ITEM_IDS, PRESETS, PRESET_IDS, ZONES, cleanReasons, correctDressing, correctFor, evaluate, fittingReasons, hasOneAnswer,
  inRackOrder, isExclusive, itemOf, itemsOfZone, jobFrom, jobProblems, parseCustomJob, putOn, readResponse, reasonFits, reasonOptions,
  replacedBy, requirements, responseFor, serializeCustomJob, statusOf, takeOff, toggle, wearable, workerSetting, type ItemId, type JobSpec,
} from "../src/equipment.ts";

/** The record as { field: value }, for comparing. */
const fields = (response: { record: { name: string; base: Record<string, unknown> }[] } | undefined) =>
  response && Object.fromEntries(response.record.map((f) => [f.name, Object.values(f.base)[0]]));

// ---- the items ----

test("19 items, each in a zone, every zone has items, the rack goes by zone", () => {
  assert.equal(ITEMS.length, 19);
  assert.equal(new Set(ITEM_IDS).size, 19);
  for (const zone of ZONES) assert.ok(itemsOfZone(zone).length > 0, zone);
  const zoneOrder = ITEMS.map((item) => ZONES.indexOf(item.zone));
  assert.deepEqual(zoneOrder, [...zoneOrder].sort((a, b) => a - b));
});

test("an item protects against something, its distractors are other hazards, the choice list has both", () => {
  for (const item of ITEMS) {
    assert.ok(item.protects.length > 0, item.id);
    assert.ok(item.distractors.length >= 2, item.id);
    for (const hazard of item.distractors) assert.ok(!item.protects.includes(hazard), `${item.id}: ${hazard}`);
    const options = reasonOptions(item.id);
    assert.equal(options.length, item.protects.length + item.distractors.length);
    assert.deepEqual(options, HAZARDS.filter((h) => options.includes(h)));
  }
  // every hazard is protected against by something
  for (const hazard of HAZARDS) assert.ok(ITEMS.some((item) => item.protects.includes(hazard)), hazard);
});

// ---- dressing ----

test("one pair of gloves, one pair of shoes, one hat, one mask, one suit: the new one replaces the other", () => {
  let worn = putOn([], "workGloves");
  assert.deepEqual(replacedBy(worn, "chemicalGloves"), ["workGloves"]);
  worn = putOn(worn, "chemicalGloves");
  assert.deepEqual(worn, ["chemicalGloves"]);
  worn = putOn(putOn(worn, "helmet"), "bumpCap");
  assert.deepEqual(worn, ["bumpCap", "chemicalGloves"]);
  worn = putOn(putOn(worn, "dustMask"), "respirator");
  assert.deepEqual(worn, ["bumpCap", "respirator", "chemicalGloves"]);
  worn = putOn(putOn(putOn(worn, "safetyShoes"), "rubberBoots"), "coverall");
  worn = putOn(worn, "coldClothing");
  assert.deepEqual(worn, ["bumpCap", "respirator", "chemicalGloves", "rubberBoots", "coldClothing"]);
});

test("ear plugs and ear muffs, a vest over a coverall, a harness: worn together, in rack order", () => {
  const worn = ["harness", "earMuffs", "hiVis", "coverall", "earPlugs", "hairnet", "goggles", "faceShield"].reduce((w, id) => putOn(w, id as ItemId), [] as ItemId[]);
  assert.deepEqual(worn, ["hairnet", "goggles", "earPlugs", "earMuffs", "faceShield", "hiVis", "coverall", "harness"]);
  assert.equal(isExclusive(itemOf("earPlugs").slot), false);
});

test("toggle, take off, and what one can wear from a list (the last of a slot wins, unknown ids left out)", () => {
  assert.deepEqual(toggle(toggle([], "goggles"), "goggles"), []);
  assert.deepEqual(takeOff(["goggles", "earMuffs"], "goggles"), ["earMuffs"]);
  assert.deepEqual(wearable(["workGloves", "nonsense", "goggles", "cutGloves", "goggles"]), ["goggles", "cutGloves"]);
  assert.deepEqual(inRackOrder(["harness", "helmet", "x"]), ["helmet", "harness"]);
});

// ---- the jobs ----

test("every preset: required items, required and allowed apart, a reason for every item it accepts", () => {
  for (const id of PRESET_IDS) {
    const job = jobFrom({ job: id });
    assert.equal(job.preset, id);
    assert.ok(job.required.length > 0, id);
    for (const item of job.allowed) assert.ok(!job.required.includes(item), `${id}: ${item}`);
    // with explain the pupil can give a right reason for everything that is not wrong
    assert.deepEqual(jobProblems(job, true), [], id);
    for (const item of [...job.required, ...job.allowed]) assert.ok(fittingReasons(job, item).length > 0, `${id}: ${item}`);
    // the correct dressing is correct, with right reasons
    const { worn, reasons } = correctDressing(job);
    const e = evaluate(job, worn, reasons);
    assert.equal(e.correct, true, id);
    assert.equal(e.reasonsCorrect, true, id);
    assert.equal(e.required, requirements(job).length);
  }
});

test("the grinding job: hearing and gloves are alternatives; four requirements", () => {
  const job = jobFrom({});
  assert.equal(job.preset, "grinding");
  assert.deepEqual(requirements(job), [["goggles"], ["earPlugs", "earMuffs"], ["workGloves", "cutGloves"], ["safetyShoes"]]);
  assert.deepEqual(evaluate(job, ["goggles", "earMuffs", "cutGloves", "safetyShoes"]), {
    required: 4, requiredTotal: 4, wrong: 0, correct: true, reasonsRight: 0, reasonsCorrect: false,
  });
  // both hearing protections: still correct (double protection), counted once
  assert.equal(evaluate(job, ["goggles", "earPlugs", "earMuffs", "workGloves", "safetyShoes"]).correct, true);
  // allowed: a face shield and a coverall are not wrong
  assert.equal(evaluate(job, ["goggles", "earPlugs", "faceShield", "workGloves", "safetyShoes", "coverall"]).correct, true);
  // too much: a helmet and a harness are not needed
  assert.deepEqual(fields(responseFor(job, ["helmet", "goggles", "earPlugs", "workGloves", "safetyShoes", "harness"], {}, false)), {
    required: 4, requiredTotal: 4, wrong: 2, correct: false, items: "helmet,goggles,earPlugs,workGloves,safetyShoes,harness",
  });
  // too little
  assert.deepEqual(evaluate(job, ["goggles"]).required, 1);
});

test("the circular saw: no gloves near a turning blade", () => {
  const job = jobFrom({ job: "circularSaw" });
  for (const gloves of ["workGloves", "chemicalGloves", "cutGloves"] as ItemId[]) assert.equal(statusOf(job, gloves), "wrong");
  assert.equal(evaluate(job, ["goggles", "earPlugs", "dustMask", "safetyShoes", "workGloves"]).correct, false);
});

test("an unknown preset is the default one; an own job that can not be read too, and the author is told", () => {
  assert.equal(jobFrom({ job: "moon" }).preset, "grinding");
  const settings = { job: "custom", customJob: "{nope" };
  const job = jobFrom(settings);
  assert.equal(job.preset, "grinding");
  assert.deepEqual(jobProblems(job, false, settings), [{ problem: "unreadableJob" }]);
});

test("an own job: read from JSON, unknown ids left out, required wins over allowed, written back the same", () => {
  const custom = parseCustomJob(
    JSON.stringify({ text: "Welding", required: ["faceShield", "workGloves", "laser"], allowed: ["workGloves", "coverall"], hazards: ["particles", "rough", "lava"] })
  )!;
  assert.deepEqual(custom, { text: "Welding", required: ["faceShield", "workGloves"], allowed: ["coverall"], hazards: ["particles", "rough"] });
  assert.deepEqual(parseCustomJob(serializeCustomJob(custom)), custom);
  for (const bad of ["", "  ", "[1]", "null", "nope"]) assert.equal(parseCustomJob(bad), null, bad);
  const job = jobFrom({ job: "custom", customJob: serializeCustomJob(custom) });
  assert.equal(job.preset, "custom");
  assert.equal(job.text, "Welding");
  assert.deepEqual(jobProblems(job, true), []);
  // no text, nothing required, an item without a reason
  const empty = jobFrom({ job: "custom", customJob: JSON.stringify({ text: " ", required: [], allowed: ["harness"], hazards: [] }) });
  assert.deepEqual(jobProblems(empty, true), [{ problem: "noText" }, { problem: "noRequired" }, { problem: "noReason", items: ["harness"] }]);
  assert.deepEqual(jobProblems(empty, false), [{ problem: "noText" }, { problem: "noRequired" }]);
});

// ---- reasons ----

test("a reason fits when the item protects against it, the job has it and the item is not wrong", () => {
  const grinding = jobFrom({ job: "grinding" });
  assert.equal(reasonFits(grinding, "goggles", "particles"), true);
  assert.equal(reasonFits(grinding, "goggles", "splashes"), false); // no chemicals in grinding
  assert.equal(reasonFits(grinding, "goggles", "noise"), false);
  assert.equal(reasonFits(grinding, "harness", "height"), false); // not needed here
  assert.equal(reasonFits(grinding, "goggles", undefined), false);
  const cleaning = jobFrom({ job: "cleaning" });
  assert.equal(reasonFits(cleaning, "goggles", "splashes"), true);
  // a dust mask does not protect against vapours
  assert.equal(reasonFits(cleaning, "dustMask", "vapours"), false);
  // reasons of items not worn, or not in the item's list, are dropped
  assert.deepEqual(cleanReasons(["goggles"], { goggles: "particles", earMuffs: "noise" }), { goggles: "particles" });
  assert.deepEqual(cleanReasons(["goggles"], { goggles: "cold" }), { goggles: "cold" }); // a distractor is a choice
  assert.deepEqual(cleanReasons(["goggles"], { goggles: "height" }), {});
});

test("the response with explain: reasons, how many fit, and whether all do", () => {
  const job = jobFrom({ job: "grinding" });
  const worn: ItemId[] = ["goggles", "earMuffs", "workGloves", "safetyShoes", "harness"];
  const response = responseFor(job, worn, { goggles: "particles", earMuffs: "cold", workGloves: "rough", harness: "height" }, true);
  assert.deepEqual(fields(response), {
    required: 4, requiredTotal: 4, wrong: 1, correct: false, items: "goggles,earMuffs,workGloves,safetyShoes,harness",
    reasons: "goggles:particles,earMuffs:cold,workGloves:rough,harness:height", reasonsRight: 2, reasonsCorrect: false,
  });
  assert.equal(responseFor(job, [], {}, true), undefined);
});

// ---- the correct response ----

test("one correct answer only without alternatives and allowed items (and, with explain, one fitting reason each)", () => {
  for (const id of PRESET_IDS) assert.equal(correctFor(jobFrom({ job: id }), false), undefined, id);
  const harnessOnly: JobSpec = { required: ["harness", "helmet"], allowed: [], hazards: ["height", "falling"] };
  assert.equal(hasOneAnswer(harnessOnly, false), true);
  assert.deepEqual(fields(correctFor(harnessOnly, false)), { required: 2, requiredTotal: 2, wrong: 0, correct: true, items: "helmet,harness" });
  assert.deepEqual(fields(correctFor(harnessOnly, true)), {
    required: 2, requiredTotal: 2, wrong: 0, correct: true, items: "helmet,harness", reasons: "helmet:falling,harness:height", reasonsRight: 2, reasonsCorrect: true,
  });
  // a helmet protects against falling objects and bumping: two right reasons, no single answer with explain
  assert.equal(hasOneAnswer({ ...harnessOnly, hazards: ["height", "falling", "bumping"] }, true), false);
  assert.equal(hasOneAnswer({ ...harnessOnly, hazards: ["height", "falling", "bumping"] }, false), true);
  assert.equal(hasOneAnswer({ required: ["earPlugs", "earMuffs"], allowed: [], hazards: ["noise"] }, false), false);
  assert.equal(hasOneAnswer({ required: [], allowed: [], hazards: [] }, false), false);
});

test("a response read back: items and reasons, also from the bare record list; junk is no response", () => {
  const job = jobFrom({ job: "cleaning" });
  const response = responseFor(job, ["goggles", "chemicalGloves", "chemicalApron", "rubberBoots"], { goggles: "splashes", rubberBoots: "wet" }, true)!;
  assert.deepEqual(readResponse(response), { worn: ["goggles", "chemicalGloves", "rubberBoots", "chemicalApron"], reasons: { goggles: "splashes", rubberBoots: "wet" } });
  assert.deepEqual(readResponse(response.record)?.worn.length, 4);
  assert.deepEqual(readResponse({ record: [{ name: "items", base: { string: "goggles, workGloves cutGloves" } }] }), { worn: ["goggles", "cutGloves"], reasons: {} });
  assert.equal(readResponse({ record: [{ name: "correct", base: { boolean: true } }] }), null);
  assert.equal(readResponse(undefined), null);
  assert.equal(readResponse("goggles"), null);
});

// ---- scoring, against a count of its own ----

test("correct is: every requirement met and nothing wrong, for 500 random dressings of every preset", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const id of PRESET_IDS) {
    const spec = PRESETS[id];
    const job = jobFrom({ job: id });
    for (let n = 0; n < 500; n++) {
      const worn = wearable(ITEM_IDS.filter(() => random() < 0.3));
      const needed = new Set(spec.required.map((item) => itemOf(item).slot));
      const met = new Set(worn.filter((item) => spec.required.includes(item)).map((item) => itemOf(item).slot));
      const wrong = worn.filter((item) => !spec.required.includes(item) && !spec.allowed.includes(item)).length;
      const e = evaluate(job, worn);
      assert.equal(e.required, met.size);
      assert.equal(e.requiredTotal, needed.size);
      assert.equal(e.wrong, wrong);
      assert.equal(e.correct, met.size === needed.size && wrong === 0);
    }
  }
});

test("the worker setting: 1, 2, 3 or the pupil's choice", () => {
  assert.equal(workerSetting("2"), 2);
  assert.equal(workerSetting("choice"), "choice");
  assert.equal(workerSetting("7"), "choice");
  assert.equal(workerSetting(undefined), "choice");
});
