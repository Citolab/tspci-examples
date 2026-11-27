/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author draws the shape on the grid of the item's own
 * settings (squares across and down, halves), and in a comparison also shape B. What the PCI computes of each shape is
 * shown next to it, so the author sees the area and perimeter the pupil should find, and, for a drawing task, whether the
 * example meets the rules. It writes the settings `shape` and `shapeB` (grid.ts serializeShape).
 */
import { useRef, useState } from "preact/hooks";
import {
  checkRules, isEmptyShape, measureShape, rulesPossible, serializeShape, asksPerimeter, compareShapes, formatNumber, type CellValue, type Settings, type Shape,
} from "./grid";
import { GridView } from "./gridView";
import { textsFor } from "./texts";

const TEXTS = {
  en: {
    title: { draw: "Draw an example answer", measure: "Draw the shape to measure", compare: "Draw the two shapes" },
    intro: {
      draw: "Optional: a shape that meets the rules. It is shown as the correct answer (status solution); the pupil's drawing is checked by the rules, not against this shape.",
      measure: "The pupil sees this shape and writes its area and/or perimeter. The correct answers follow from it.",
      compare: "The pupil sees both shapes and chooses the larger one. The correct answer follows from them.",
    },
    shape: "Shape",
    shapeA: "Shape A",
    shapeB: "Shape B",
    clear: "Clear",
    area: "Area",
    perimeter: "Perimeter",
    noPerimeter: "none in grid units (slanting sides)",
    onePiece: "One piece",
    holes: "Holes",
    rectangle: "Rectangle",
    meetsRules: "Meets the rules",
    larger: "Correct answer",
    same: "both the same",
    yes: "yes",
    no: "no",
    squares: "squares",
    errors: {
      noShape: "Draw the shape the pupil measures.",
      noShapes: "Draw both shapes.",
      slanting: "A shape with half squares has slanting sides and no perimeter in grid units: ask only the area, or use whole squares.",
      notRules: "The example shape does not meet the rules.",
      impossible: "No shape on this grid can meet the rules (area, perimeter, rectangle).",
    },
  },
  nl: {
    title: { draw: "Een voorbeeldantwoord tekenen", measure: "De figuur om te meten tekenen", compare: "De twee figuren tekenen" },
    intro: {
      draw: "Niet verplicht: een figuur die aan de regels voldoet. Die wordt als goed antwoord getoond (status solution); de tekening van de leerling wordt met de regels nagekeken, niet met deze figuur vergeleken.",
      measure: "De leerling ziet deze figuur en vult de oppervlakte en/of omtrek in. De goede antwoorden volgen eruit.",
      compare: "De leerling ziet beide figuren en kiest de grootste. Het goede antwoord volgt eruit.",
    },
    shape: "Figuur",
    shapeA: "Figuur A",
    shapeB: "Figuur B",
    clear: "Wissen",
    area: "Oppervlakte",
    perimeter: "Omtrek",
    noPerimeter: "geen in roostereenheden (schuine zijden)",
    onePiece: "Eén geheel",
    holes: "Gaten",
    rectangle: "Rechthoek",
    meetsRules: "Voldoet aan de regels",
    larger: "Goede antwoord",
    same: "allebei even groot",
    yes: "ja",
    no: "nee",
    squares: "hokjes",
    errors: {
      noShape: "Teken de figuur die de leerling meet.",
      noShapes: "Teken beide figuren.",
      slanting: "Een figuur met halve hokjes heeft schuine zijden en geen omtrek in roostereenheden: vraag alleen de oppervlakte, of gebruik hele hokjes.",
      notRules: "De voorbeeldfiguur voldoet niet aan de regels.",
      impossible: "Geen figuur op dit rooster kan aan de regels voldoen (oppervlakte, omtrek, rechthoek).",
    },
  },
};
export type AuthoringLanguage = keyof typeof TEXTS;

/** What keeps the author's settings from making a working item, in the author's language (validate()). */
export function authoringProblems(settings: Settings, shape: Shape, shapeB: Shape, language: AuthoringLanguage): string[] {
  const e = TEXTS[language].errors;
  const problems: string[] = [];
  if (settings.task === "measure") {
    if (isEmptyShape(shape)) problems.push(e.noShape);
    else if (asksPerimeter(settings.ask) && measureShape(shape).perimeter === null) problems.push(e.slanting);
  } else if (settings.task === "compare") {
    if (isEmptyShape(shape) || isEmptyShape(shapeB)) problems.push(e.noShapes);
    else if (settings.compareBy === "perimeter" && (measureShape(shape).perimeter === null || measureShape(shapeB).perimeter === null)) problems.push(e.slanting);
  } else {
    if (!rulesPossible(settings.rules, settings.columns, settings.rows, settings.halves)) problems.push(e.impossible);
    if (!isEmptyShape(shape) && !checkRules(measureShape(shape), settings.rules).meetsRules) problems.push(e.notRules);
  }
  return problems;
}

type Props = {
  settings: Settings;
  language: AuthoringLanguage;
  onChange: (shapes: { shape: string; shapeB: string }) => void;
};

export function Authoring({ settings, language, onChange }: Props) {
  const [shapes, setShapes] = useState({ a: settings.shape, b: settings.shapeB });
  const current = useRef(shapes); // the shapes as they are now, also between two renders during a fast drag
  const t = TEXTS[language];
  const gridTexts = textsFor(language);
  const update = (which: "a" | "b", cells: (cells: CellValue[]) => CellValue[]) => {
    const next = { ...current.current, [which]: { ...current.current[which], cells: cells(current.current[which].cells) } };
    current.current = next;
    setShapes(next);
    onChange({ shape: serializeShape(next.a), shapeB: serializeShape(next.b) });
  };
  const setCell = (which: "a" | "b", index: number, value: CellValue) => update(which, (cells) => cells.map((v, i) => (i === index ? value : v)));
  const clear = (which: "a" | "b") => update(which, (cells) => cells.map(() => 0 as CellValue));
  const compare = settings.task === "compare";
  const problems = authoringProblems(settings, shapes.a, shapes.b, language);
  const larger = compare ? compareShapes(shapes.a, shapes.b, settings.compareBy) : null;

  const editor = (which: "a" | "b", name: string) => (
    <section className="flex min-w-0 flex-col gap-2" aria-label={name}>
      <h3 className="text-base font-semibold">{name}</h3>
      <GridView
        shape={shapes[which]}
        editable
        halves={settings.halves}
        t={gridTexts}
        look={which}
        cellSize={compare ? 26 : 34}
        label={`${name}: ${gridTexts.grid(settings.columns, settings.rows)}`}
        onCell={(index, value) => setCell(which, index, value)}
      />
      <div className="flex items-start justify-between gap-3">
        <Measures shape={shapes[which]} settings={settings} t={t} language={language} />
        <button type="button" className="button" onClick={() => clear(which)}>
          {t.clear}
        </button>
      </div>
    </section>
  );

  return (
    <div className="p-5 font-sans text-ink">
      <h2 className="text-xl font-semibold tracking-tight">{t.title[settings.task]}</h2>
      <p className="max-w-[48em] text-slate-600">{t.intro[settings.task]}</p>
      <p className="mt-1 text-sm text-slate-500">{settings.halves ? gridTexts.hintHalves : gridTexts.hint}</p>
      <div className="mt-4 flex flex-wrap gap-6">
        {editor("a", compare ? t.shapeA : t.shape)}
        {compare && editor("b", t.shapeB)}
      </div>
      {compare && larger && (
        <p className="mt-3 font-semibold" data-larger>
          {t.larger}: {larger === "same" ? t.same : larger === "A" ? t.shapeA : t.shapeB}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-red-700" role="status">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the PCI computes of a shape, as the author sees it. */
function Measures({ shape, settings, t, language }: { shape: Shape; settings: Settings; t: (typeof TEXTS)["en"]; language: AuthoringLanguage }) {
  const m = measureShape(shape);
  if (m.empty) return <span />;
  const yesNo = (value: boolean) => (value ? t.yes : t.no);
  const rows: [string, string][] = [
    [t.area, `${formatNumber(m.area, language)} ${t.squares}`],
    [t.perimeter, m.perimeter === null ? t.noPerimeter : formatNumber(m.perimeter, language)],
    [t.onePiece, yesNo(m.connected)],
    [t.holes, String(m.holes)],
    [t.rectangle, yesNo(m.rectangle)],
  ];
  if (settings.task === "draw") rows.push([t.meetsRules, yesNo(checkRules(m, settings.rules).meetsRules)]);
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-3 text-sm" data-measures>
      {rows.map(([name, value]) => [
        <dt key={`${name}-dt`} className="text-slate-600">{name}</dt>,
        <dd key={`${name}-dd`} className="m-0 font-semibold">{value}</dd>,
      ])}
    </dl>
  );
}
