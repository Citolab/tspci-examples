/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author arranges what a frame that only shows a number
 * (task "show") shows, on the real frame of the item (the model and size of its settings): 5 and 5 instead of 10, a
 * scattered set of squares to count, or a sum in two colours. It writes the setting `layout` (beadFrame.ts
 * serializeLayout). The number setting is what the frame shows until the author arranges something else.
 */
import { useRef, useState } from "preact/hooks";
import { Fill, Grid, Settings, counts, paintCell, pushRow, serializeLayout, structuredGrid } from "./beadFrame";
import { Frame, Pens } from "./frame";
import { textsFor } from "./texts";

const TEXTS = {
  en: {
    title: "Arrange what the frame shows",
    intro:
      "Push beads or colour squares as the candidate should see them, in one or two colours. This is used when the task is “Only show a number”; the item asks the question.",
    shown: (value: number) => `Shown: ${value}`,
  },
  nl: {
    title: "Neerleggen wat het rek of veld toont",
    intro:
      "Schuif kralen of kleur hokjes zoals de leerling ze moet zien, in één of twee kleuren. Dit geldt als de opdracht “Alleen een getal tonen” is; het item stelt de vraag.",
    shown: (value: number) => `Getoond: ${value}`,
  },
};

/** The layout setting for what the author arranged: "" when it is what the number setting shows anyway. */
export function authoringLayout(settings: Settings, grid: Grid): string {
  const layout = serializeLayout(grid);
  return layout === serializeLayout(structuredGrid(settings.rows, settings.number ?? 0)) ? "" : layout;
}

type Props = { settings: Settings; initial: Grid; language: "en" | "nl"; onChange: (grid: Grid) => void };

export function Authoring({ settings, initial, language, onChange }: Props) {
  const [grid, setGrid] = useState(initial);
  // the latest grid: a drag may paint several squares before the next render
  const latest = useRef(initial);
  const [pen, setPen] = useState<1 | 2>(1);
  const t = textsFor(language);
  const own = TEXTS[language];
  const change = (update: (current: Grid) => Grid) => {
    const next = update(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setGrid(next);
    onChange(next);
  };
  const { value } = counts(grid);

  return (
    <div className="p-5 font-sans text-ink">
      <h2 className="text-xl font-semibold tracking-tight">{own.title}</h2>
      <p className="mt-1 text-slate-600">{own.intro}</p>
      <Pens model={settings.model} pen={pen} onPen={setPen} t={t} labels={[t.pen(1, ""), t.pen(2, "")]} />
      <div className="frame-box mt-4">
        <Frame
          model={settings.model}
          look={settings.look}
          grid={grid}
          interactive
          display={false}
          sum
          pen={pen}
          t={t}
          current={() => latest.current}
          onPush={(row, count) => change((current) => pushRow(current, row, count, pen))}
          onPaint={(row, column, fill: Fill) => change((current) => paintCell(current, row, column, fill))}
        />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <button type="button" className="reset" disabled={value === 0} onClick={() => change((current) => current.map((row) => row.map((): Fill => 0)))}>
          {t.reset(settings.model)}
        </button>
        <p className="total" data-total>
          {own.shown(value)}
        </p>
      </div>
    </div>
  );
}
