/*
 * The authoring mode of the floor covering task (index.tsx getAuthoringInstance): the author draws the room on the grid
 * of the item's settings, chooses the wall with the door, and may lay a plan of strips: the plan the pupil fills in the
 * bill for when the pupil only does the bill, and the plan shown as the solution. Next to it, what the PCI computes: the
 * floor area, the perimeter, the skirting, the plan with the least waste and the bill. It writes the settings `room`,
 * `door` and `strips`.
 */
import { useRef, useState } from "preact/hooks";
import { serializeShape, type CellValue, type Shape } from "./grid";
import { GridView } from "./gridView";
import { textsFor } from "./texts";
import {
  asksStrips, billFor, coverProblems, coverSettingsFrom, decimal, eurosText, leastPlan, measurePlan, perimeterSquares, roomSquares,
  serializeStrips, skirtingMetres, solutionPlan, walls, type CoverProblem, type CoverSettings, type Side, type Strip,
} from "./cover.ts";
import { coverTextsFor } from "./coverTexts.ts";
import { PlanView } from "./planView.tsx";
import { StripList } from "./coverView.tsx";

export type CoverProperties = { room: string; door: string; strips: string };
type Language = "en" | "nl";

const TEXTS = {
  en: {
    title: "Draw the room",
    intro:
      "Draw the floor of the room on the left, one piece of whole squares. Choose the wall with the door. On the right you may lay a plan of strips: the plan the pupil makes the bill for when the pupil only does the bill, and the plan shown as the solution. Without a plan the PCI uses the plan with the least waste.",
    room: "The room",
    plan: "The plan (optional)",
    clear: "Clear",
    door: "Door",
    noDoor: "No door",
    wall: (n: number, side: Side, metres: string) => `Wall ${n}: ${{ top: "top", right: "right", bottom: "bottom", left: "left" }[side]}, ${metres}`,
    least: "Lay the plan with the least waste",
    clearPlan: "Clear the plan",
    measures: "What the PCI computes",
    area: "Floor area",
    perimeter: "Perimeter",
    skirting: "Skirting (without the door)",
    leastPlan: "Least running length",
    way: (vertical: boolean) => (vertical ? "top to bottom" : "left to right"),
    waste: "waste",
    yourPlan: "Your plan",
    covers: (yes: boolean) => (yes ? "covers the floor" : "does not cover the floor"),
    solution: "The solution's plan",
    bill: "The bill",
    total: "Total",
    errors: {
      noRoom: "Draw the room.",
      roomPieces: "The room must be one piece.",
      roomHoles: "The room must not have holes.",
      rollWidth: "The roll width must be a whole number of squares (a multiple of the scale).",
      noPlan: "No strips of this roll fit on the grid: make the grid larger or the roll narrower.",
      noDoorWall: "The room has no wall with this number: choose the wall with the door again.",
      doorTooWide: "The door is wider than its wall.",
      noPrice: "Give the price per running metre for the bill.",
      planNotCovering: "The plan does not cover the whole floor.",
      planNotLeast: "The plan has more waste than needed: lay the plan with the least waste, or clear it.",
    } satisfies Record<CoverProblem, string>,
  },
  nl: {
    title: "De kamer tekenen",
    intro:
      "Teken links de vloer van de kamer, één geheel van hele hokjes. Kies de muur met de deur. Rechts kun je een plan met banen leggen: het plan waarvoor de leerling de rekening maakt als die alleen de rekening doet, en het plan dat als oplossing wordt getoond. Zonder plan gebruikt de PCI het plan met het minste afval.",
    room: "De kamer",
    plan: "Het plan (niet verplicht)",
    clear: "Wissen",
    door: "Deur",
    noDoor: "Geen deur",
    wall: (n: number, side: Side, metres: string) => `Muur ${n}: ${{ top: "boven", right: "rechts", bottom: "onder", left: "links" }[side]}, ${metres}`,
    least: "Het plan met het minste afval leggen",
    clearPlan: "Plan wissen",
    measures: "Wat de PCI berekent",
    area: "Oppervlakte vloer",
    perimeter: "Omtrek",
    skirting: "Plinten (zonder de deur)",
    leastPlan: "Kleinste lengte",
    way: (vertical: boolean) => (vertical ? "van boven naar beneden" : "van links naar rechts"),
    waste: "afval",
    yourPlan: "Jouw plan",
    covers: (yes: boolean) => (yes ? "bedekt de vloer" : "bedekt de vloer niet"),
    solution: "Plan van de oplossing",
    bill: "De rekening",
    total: "Totaal",
    errors: {
      noRoom: "Teken de kamer.",
      roomPieces: "De kamer moet één geheel zijn.",
      roomHoles: "De kamer mag geen gaten hebben.",
      rollWidth: "De rolbreedte moet een heel aantal hokjes zijn (een veelvoud van de schaal).",
      noPlan: "Geen baan van deze rol past op het rooster: maak het rooster groter of de rol smaller.",
      noDoorWall: "De kamer heeft geen muur met dit nummer: kies de muur met de deur opnieuw.",
      doorTooWide: "De deur is breder dan de muur.",
      noPrice: "Geef de prijs per strekkende meter voor de rekening.",
      planNotCovering: "Het plan bedekt niet de hele vloer.",
      planNotLeast: "Het plan heeft meer afval dan nodig: leg het plan met het minste afval, of wis het.",
    } satisfies Record<CoverProblem, string>,
  },
};

/** What keeps the author's settings from making a working item, in the author's language (validate()). */
export const coverAuthoringProblems = (s: CoverSettings, language: Language): string[] => coverProblems(s).map((p) => TEXTS[language].errors[p]);

type Props = {
  properties: Record<string, string>;
  language: Language;
  onChange: (next: CoverProperties) => void;
};

export function CoverAuthoring({ properties, language, onChange }: Props) {
  const t = TEXTS[language];
  const tc = coverTextsFor(language);
  const gridTexts = textsFor(language);
  const settingsOf = (next: CoverProperties) => coverSettingsFrom({ ...properties, ...next });
  const first = settingsOf({ room: properties.room ?? "", door: properties.door ?? "", strips: properties.strips ?? "" });
  const [room, setRoom] = useState<Shape>(first.room);
  const [door, setDoor] = useState(properties.door ?? "");
  const [strips, setStrips] = useState<Strip[]>(first.plan);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const current = useRef({ room, door, strips }); // as they are now, also between two renders during a fast drag
  const root = useRef<HTMLDivElement>(null);

  const update = (next: Partial<{ room: Shape; door: string; strips: Strip[] }>) => {
    current.current = { ...current.current, ...next };
    if (next.room) setRoom(next.room);
    if (next.door !== undefined) setDoor(next.door);
    if (next.strips) setStrips(next.strips);
    onChange({ room: serializeShape(current.current.room), door: current.current.door, strips: serializeStrips(current.current.strips, first.scale) });
  };
  const setCell = (index: number, value: CellValue) => update({ room: { ...current.current.room, cells: current.current.room.cells.map((v, i) => (i === index ? value : v)) } });
  const setStrip = (index: number, strip: Strip | null) => {
    const list = current.current.strips;
    update({ strips: strip ? [...list.slice(0, index), strip, ...list.slice(index + 1)] : list.filter((_, i) => i !== index) });
  };

  const s = settingsOf({ room: serializeShape(room), door, strips: serializeStrips(strips, first.scale) });
  const problems = coverAuthoringProblems(s, language);
  const wallList = walls(room);
  const metres = (m: number) => `${decimal(m, language)} m`;
  const least = s.width ? leastPlan(s.room, s.width) : null;
  const own = measurePlan(s.room, strips, s.width);
  const plan = solutionPlan(s);
  const bill = plan ? billFor(s, plan) : null;
  const area = roomSquares(room) * s.scale * s.scale;
  const rows: [string, string][] = area
    ? [
        [t.area, `${decimal(area, language)} m²`],
        [t.perimeter, metres(perimeterSquares(room) * s.scale)],
        ...(s.skirtingPrice !== null ? ([[t.skirting, metres(skirtingMetres(s))]] as [string, string][]) : []),
        ...(least
          ? ([[t.leastPlan, `${metres(least.runningSquares * s.scale)} (${t.way(least.vertical)}), ${t.waste} ${decimal((least.runningSquares * s.width - roomSquares(room)) * s.scale * s.scale, language)} m²`]] as [string, string][])
          : []),
        ...(strips.length
          ? ([[t.yourPlan, `${metres(own.runningSquares * s.scale)}, ${t.covers(own.covered)}, ${t.waste} ${decimal(own.wasteSquares * s.scale * s.scale, language)} m²`]] as [string, string][])
          : []),
      ]
    : [];

  return (
    <div ref={root} className="p-5 font-sans text-ink">
      <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
      <p className="max-w-[52em] text-slate-600">{t.intro}</p>
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-col gap-2" aria-label={t.room}>
          <h3 className="text-base font-semibold">{t.room}</h3>
          <GridView
            shape={room}
            editable
            halves={false}
            t={gridTexts}
            cellSize={s.columns > 14 ? 22 : 28}
            label={`${t.room}: ${gridTexts.grid(s.columns, s.rows)}`}
            onCell={setCell}
          />
          <p className="max-w-[28em] text-sm text-slate-500">{gridTexts.hint}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="button" onClick={() => update({ room: { ...room, cells: room.cells.map(() => 0 as CellValue) } })}>
              {t.clear}
            </button>
            <label className="flex items-center gap-2 text-sm font-semibold">
              {t.door}
              <select className="rounded-md border-2 border-slate-300 bg-white px-2 py-1.5 text-sm" value={door} onChange={(e) => update({ door: e.currentTarget.value })} data-door-select>
                <option value="">{t.noDoor}</option>
                {wallList.map((w, i) => (
                  <option key={i} value={String(i + 1)}>
                    {t.wall(i + 1, w.side, metres(w.length * s.scale))}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-2" aria-label={t.plan}>
          <h3 className="text-base font-semibold">{t.plan}</h3>
          <PlanView
            s={s}
            t={tc}
            language={language}
            strips={strips}
            selected={selected}
            editable
            cellSize={s.columns > 14 ? 22 : 28}
            onSelect={setSelected}
            onStrip={(index, strip) => setStrip(index, strip)}
          />
          <p className="text-sm text-slate-600">
            {tc.scale(s.scale)} · {tc.roll(tc.material[s.material], s.rollWidth)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button" disabled={!least} onClick={() => least && update({ strips: least.strips })} data-least>
              {t.least}
            </button>
            <button type="button" className="button" disabled={!strips.length} onClick={() => update({ strips: [] })}>
              {t.clearPlan}
            </button>
          </div>
          <StripList s={s} t={tc} strips={strips} selected={selected} onSelect={setSelected} readOnly={false} onChange={setStrip} announce={setMessage} root={root} />
        </section>
      </div>

      {rows.length > 0 && (
        <section className="mt-4" aria-label={t.measures}>
          <h3 className="text-base font-semibold">{t.measures}</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm" data-measures>
            {rows.map(([name, value]) => [
              <dt key={`${name}-dt`} className="text-slate-600">{name}</dt>,
              <dd key={`${name}-dd`} className="m-0 font-semibold">{value}</dd>,
            ])}
          </dl>
          {bill && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 text-sm" data-bill-preview>
              {bill.lines.map((line) => [
                <dt key={`${line.id}-dt`} className="text-slate-600">
                  {line.id === "covering" ? tc.bill.covering(tc.material[s.material]) : line.id === "skirting" ? tc.bill.skirting : tc.bill.threshold}
                </dt>,
                <dd key={`${line.id}-dd`} className="m-0 font-semibold">
                  {line.metres !== null ? `${metres(line.metres)} × ${eurosText(line.price, language)} = ` : ""}
                  {eurosText(line.amount, language)}
                </dd>,
              ])}
              <dt className="text-slate-600">{t.total}</dt>
              <dd className="m-0 font-semibold">{eurosText(bill.total, language)}</dd>
            </dl>
          )}
          {asksStrips(s) && plan && (
            <p className="mt-1 text-sm text-slate-600">
              {t.solution}: {serializeStrips(plan, s.scale)}
            </p>
          )}
        </section>
      )}

      {problems.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-red-700" role="status">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
