import { useState, useRef, useMemo } from "preact/hooks";
import useMouse from "@react-hook/mouse-position";
import { useEffect } from "preact/hooks";
import { StateModel } from "./store";
import configProps from "./config.json";
import { IStore, useStore } from "@citolab/preact-store";
import type { PciProperties } from "@citolab/tspci";
import { GRID, Partition, borders, regionRuns, regions } from "./partition";
type PropTypes = PciProperties<typeof configProps>;

/** The eraser is a "colour" too: painting with it makes a shape white again. */
const ERASER = "";
/** Room around the shape, where the squared paper shows (drawing units). */
const MARGIN = 64;
const SQUARE = 32;

/** Squared paper: dashed lines every SQUARE units over the whole drawing. */
export const Paper = ({ width, height, x = 0, y = 0 }: { width: number; height: number; x?: number; y?: number }) => (
  <g fill="none" stroke="#dbe1e8" stroke-dasharray="3 3">
    {Array.from({ length: Math.floor(width / SQUARE) + 1 }, (_, i) => (
      <line key={`v${i}`} x1={x + i * SQUARE + 0.5} y1={y} x2={x + i * SQUARE + 0.5} y2={y + height} />
    ))}
    {Array.from({ length: Math.floor(height / SQUARE) + 1 }, (_, i) => (
      <line key={`h${i}`} x1={x} y1={y + i * SQUARE + 0.5} x2={x + width} y2={y + i * SQUARE + 0.5} />
    ))}
  </g>
);

const Interaction = ({ config, partition, store }: { config: PropTypes; partition: Partition; store: IStore<StateModel> }) => {
  const { width, height } = config;
  const colors = config.colors.split(",").map((c) => c.trim().toLowerCase());

  const [selectedColor, setSelectedColor] = useState<string>(colors[0]);

  const svgContainer = useRef<HTMLDivElement>();

  const state = useStore(store);
  const parts = useMemo(() => regions(partition), [partition]);
  const lines = useMemo(() => borders(parts), [parts]);
  const cellW = partition.width / GRID;
  const cellH = partition.height / GRID;

  const mouse = useMouse(svgContainer, {
    fps: 60,
    enterDelay: 100,
    leaveDelay: 100,
  });

  useEffect(() => {
    const scale = mouse.isDown ? 0.8 : 1;
    svgContainer.current.style.cursor = getCursor(scale, selectedColor);
  }, [selectedColor, mouse.isDown]);

  const paint = (id: string) => {
    const current = store.getState().vlakken.find((v) => v.id === id);
    if (selectedColor === ERASER) {
      if (current) store.dispatch<{ id: string }>({ type: "CLEAR_COLOR", payload: { id } });
    } else if (current?.color !== selectedColor) {
      store.dispatch<{ id: string; color: string }>({ type: "SET_COLOR", payload: { id, color: selectedColor } });
    }
  };

  const drawingWidth = partition.width + 2 * MARGIN;
  const drawingHeight = partition.height + 2 * MARGIN;

  return (
    <div className="inline-flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-linear-to-b from-white to-slate-50 px-6 pt-5 pb-4 font-sans text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
      {config.instruction && <p className="m-0 max-w-[36ch] text-center text-[15px] text-slate-600">{config.instruction}</p>}
      <div className="flex justify-center" ref={svgContainer}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${drawingWidth} ${drawingHeight}`} width={width} height={height}
          preserveAspectRatio="xMidYMid meet">
          <Paper width={drawingWidth} height={drawingHeight} />
          <g transform={`translate(${MARGIN} ${MARGIN})`}>
            {parts.map((part, i) => {
              const fill = state.vlakken.find((v) => v.id === part.id)?.color || "#fff";
              return (
                <g key={part.id} data-name={part.id} role="button" tabIndex={0} aria-label={`part ${i + 1}`} fill={fill} stroke={fill} stroke-width="1"
                  onMouseDown={() => paint(part.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), paint(part.id))}
                  className="outline-none focus-visible:[&>rect]:opacity-80">
                  {regionRuns(part).map((run) => (
                    <rect key={`${run.x},${run.y}`} x={run.x * cellW} y={run.y * cellH} width={run.w * cellW} height={cellH} />
                  ))}
                </g>
              );
            })}
            <g fill="none" stroke="#334155" stroke-width="3" stroke-linecap="square" pointer-events="none">
              {lines.map(([x1, y1, x2, y2]) => (
                <line key={`${x1},${y1},${x2},${y2}`} x1={x1 * cellW} y1={y1 * cellH} x2={x2 * cellW} y2={y2 * cellH} />
              ))}
              <rect width={partition.width} height={partition.height} stroke-linejoin="round" />
            </g>
          </g>
        </svg>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white p-1.5 shadow-sm" role="radiogroup" aria-label="colour">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === selectedColor}
              aria-label={c}
              className={`h-9 w-9 cursor-pointer rounded-full border-2 border-white transition-transform ${
                c === selectedColor ? "scale-110 ring-2 ring-slate-800 ring-offset-1" : "hover:scale-105"
              }`}
              style={{ background: c }}
              onClick={() => setSelectedColor(c)}
            />
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={selectedColor === ERASER}
            aria-label="eraser"
            title="eraser"
            className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 border-slate-300 bg-white text-slate-500 transition-transform ${
              selectedColor === ERASER ? "scale-110 ring-2 ring-slate-800 ring-offset-1" : "hover:scale-105"
            }`}
            onClick={() => setSelectedColor(ERASER)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-default disabled:opacity-40"
          disabled={state.vlakken.length === 0}
          onClick={() => store.dispatch({ type: "CLEAR_ALL", payload: null })}
        >
          {config.resetLabel}
        </button>
      </div>
    </div>
  );
};

function getCursor(scale: number, selectedColor: string): string {
  if (selectedColor === ERASER) selectedColor = "%23ffffff' stroke='%2394a3b8' stroke-width='2";
  else selectedColor = selectedColor.replace("#", "%23");
  return (
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E` +
    `%3Ccircle id='Ellipse_10' cx='16' cy='16' r='16' fill='%23fff'/%3E` +
    `%3Cg style='transition: all .4s; transform: translate(${16 * (1 - scale)}px,${16 * (1 - scale)
    }px) scale(${scale})' %3E` +
    `%3Ccircle id='Ellipse_11' cx='12' cy='12' r='12' transform='translate(4 4)' fill='${selectedColor}'/%3E` +
    `%3C/g%3E` +
    `%3C/svg%3E` +
    `") 16 16, pointer`
  );
}

export default Interaction;
