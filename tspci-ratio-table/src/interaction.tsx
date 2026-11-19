import type { PciProperties } from "@citolab/tspci";
import { IStore, useStore } from "@citolab/preact-store";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import configProps from "./config.json";
import { Actions, ArrowSide, MAX_COLUMNS, Operator, MIN_COLUMNS, ROWS, StateModel, answerCell } from "./store";
// Images are bundled too: `import logo from "./assets/logo.png"` gives a data URL for <img src={logo} />. Larger media
// (video, sound): declare them in config.tspci.media and use `media(name, dom)` from "@citolab/tspci/media" (readme, "Media").

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

/** The interaction itself: Tailwind classes only, styles.css just loads Tailwind (into the shadow root). */
const Interaction = ({ config, store, readOnly }: Props) => {
  const state = useStore(store); // re-renders when the store changes
  const { columns, cells, labels, arrowsTop, arrowsBottom, operatorsTop, operatorsBottom } = state;
  const answer = answerCell(state);

  // One arrow per line between two value columns (columns - 1 of them): the x of each line, relative to the table,
  // is the right edge of the value cell to its left. Measured in the first row; cells[0] is the label (th).
  const table = useRef<HTMLTableElement>(null);
  const [arrowXs, setArrowXs] = useState<number[]>([]);
  useLayoutEffect(() => {
    const measure = () => {
      const left = table.current.getBoundingClientRect().left;
      const cells = Array.from(table.current.rows[0].cells).slice(1, -1); // every value cell but the last
      setArrowXs(cells.map((cell) => cell.getBoundingClientRect().right - left));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table.current);
    return () => observer.disconnect();
  }, [columns]); // another column changes the column widths, not the table's: measure again

  /** The props of an arrow: its number and operator from the store, and every change back to it. */
  const arrowInput = (side: ArrowSide, value = "", operator: Operator = "multiply") => ({
    value,
    operator,
    disabled: readOnly,
    onChange: (index: number, value: string) => store.dispatch({ type: "SET_ARROW", payload: { side, index, value } }),
    onToggle: (index: number) => store.dispatch({ type: "TOGGLE_OPERATOR", payload: { side, index } }),
  });

  const tableHeader = "border-r-2 border-slate-400 pr-2 text-left"; // th is centred by default
  const tableCell = "pl-2 border-l-2 border-slate-400";
  const topRow = "border-b-2 border-slate-400";

  return (
    <div >
      <h2 className="text-xl font-semibold tracking-tight">{config.title}</h2>
      <p className="text-slate-600">{config.question}</p>
      <div className="mt-[1em]">
        {/* flex + justify-center: the table and its arrows sit in the vertical middle of the dashed box. */}
        <div className="relative flex w-[95%] h-[25em] flex-col justify-center border-dashed border-2 border-slate-400 p-6">
          {/* pt/pb: room for the inputs that stick out of the arrow strips (top-[-25px] and top-[45px]), so the
              group is centred as a whole and nothing touches the dashed border. */}
          <div className="pt-6 pb-10">
            {/* The header is the first column: each row starts with its label (th scope="row"), then its values. */}
            {/* The arrows sit outside the table, in a strip above it, one at the x of each line between two value columns. */}
            <div className="relative h-12">
              {arrowXs.map((x, i) => <ArrowRatioTop key={i} x={x} i={i} {...arrowInput("top", arrowsTop[i], operatorsTop[i])} />)}
            </div>
            {/* Fixed input widths (labels w-48, numbers w-28): with few columns the table is 70% wide, with more it
                grows past that (a table's width is a minimum), so the labels keep their size. */}
            <table ref={table} className="w-[70%] h-[8em]">
              <tbody>
                {/* One row per ROWS, one value cell per column: both come from the store. */}
                {Array.from({ length: ROWS }, (_, row) => (
                  <tr key={row} className={row === 0 ? topRow : undefined}>
                    <th scope="row" className={tableHeader}>
                      <input
                        id={`label-input-${row + 1}`}
                        name={`label-input-${row + 1}`}
                        className="w-48"
                        type="text"
                        placeholder="Label"
                        value={labels[row]}
                        disabled={readOnly}
                        onInput={(e) => store.dispatch({ type: "SET_LABEL", payload: { row, value: e.currentTarget.value } })}
                      ></input>
                    </th>
                    {Array.from({ length: columns }, (_, column) => (
                      <td key={column} className={tableCell}>
                        <input
                          className="w-28"
                          type="number"
                          placeholder="Nummer"
                          id={`number-${row + 1}-${column + 1}`}
                          name={`number-${row + 1}-${column + 1}`}
                          // data-answer: the cell whose value is the response (index.tsx finds it for validity)
                          data-answer={row === answer.row && column === answer.column ? "" : undefined}
                          value={cells[row][column]}
                          disabled={readOnly}
                          onInput={(e) => store.dispatch({ type: "SET_CELL", payload: { row, column, value: e.currentTarget.value } })}
                        ></input>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* The bottom arrow strip, below the table: a div is not allowed inside a <table>. */}
            <div className="relative h-12">
              {arrowXs.map((x, i) => <ArrowRatioBottom key={i} x={x} i={i} {...arrowInput("bottom", arrowsBottom[i], operatorsBottom[i])} />)}
            </div>
          </div>
          {/* absolute: pinned to the bottom left of the dashed box (relative), outside the flow, so the table stays centred. */}
          <div className="absolute bottom-4 left-4 flex gap-2">
            <button type="button" title="Kolom toevoegen" aria-label="Kolom toevoegen" disabled={readOnly || columns >= MAX_COLUMNS}
              onClick={() => store.dispatch({ type: "ADD_COLUMN", payload: null })}
              className="bg-slate-700 text-white px-4 py-2 rounded disabled:opacity-40 cursor-pointer">+</button>
            <button type="button" title="kolom verwijderen" aria-label="Kolom verwijderen" disabled={readOnly || columns <= MIN_COLUMNS}
              onClick={() => store.dispatch({ type: "REMOVE_COLUMN", payload: null })}
              className="bg-slate-700 text-white px-4 py-2 rounded disabled:opacity-40 cursor-pointer">−</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** An arrow between value columns i and i + 1, at x (px from the left of the table), with the input on it. */
type ArrowProps = {
  x: number;
  i: number;
  value: string;
  operator: Operator;
  disabled: boolean;
  onChange: (index: number, value: string) => void;
  onToggle: (index: number) => void;
};

/** Arrow centred on x, at the bottom of the strip above the table. */
function ArrowRatioTop({ x, i, value, operator, disabled, onChange, onToggle }: ArrowProps) {
  const arrowStyle = "pointer-events-none absolute bottom-0 -translate-x-1/2 text-red-700";

  return (
    <div>
      <div className="absolute top-[-25px] flex flex-row items-center" style={{ left: `${x - 30}px` }}>
        <ToggleOperator id={"operator-a1-" + (i + 1)} operator={operator} disabled={disabled} onToggle={() => onToggle(i)} />
        <input id={"input-a1-2-" + (i + 1)} name={"input-a1-2-" + (i + 1)} className="w-[70px]" type="number" value={value} disabled={disabled} onInput={(e) => onChange(i, e.currentTarget.value)}></input>
      </div>
      <svg className={arrowStyle} style={{ left: `${x}px` }} xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
      </svg>
    </div>
  );
}

function ArrowRatioBottom({ x, i, value, operator, disabled, onChange, onToggle }: ArrowProps) {
  const arrowStyle = "pointer-events-none absolute bottom-0 -translate-x-1/2 text-red-700 rotate-y-180 rotate-z-180 top-[-10px]";

  return (
    <div>
      <svg className={arrowStyle} style={{ left: `${x}px` }} xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
      </svg>
      <div className="absolute top-[25px] flex flex-row items-center" style={{ left: `${x - 30}px` }}>
        <ToggleOperator id={"operator-a2-" + (i + 1)} operator={operator} disabled={disabled} onToggle={() => onToggle(i)} />
        <input id={"input-a2-2-" + (i + 1)} name={"input-a2-2-" + (i + 1)} className="w-[70px]" type="number" value={value} disabled={disabled} onInput={(e) => onChange(i, e.currentTarget.value)}></input>
      </div>
    </div>
  );
}

/** Switches an arrow between multiply (×) and divide (:). The label says what a click does, for a screen reader. */
function ToggleOperator({ id, operator, disabled, onToggle }: { id: string; operator: Operator; disabled: boolean; onToggle: () => void }) {
  const multiply = operator === "multiply";
  return (
    <button
      type="button" // not "submit": a button in a form would submit it
      id={id}
      name={id}
      className="w-[2em] h-[2em] border-1 border-slate-300 bg-slate-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onToggle}
      title={multiply ? "Keer, klik voor delen" : "Gedeeld door, klik voor keer"}
      aria-label={multiply ? "Keer. Klik om te wisselen naar gedeeld door" : "Gedeeld door. Klik om te wisselen naar keer"}
    >
      {multiply ? "×" : ":"}
    </button>
  );
}

export default Interaction;
