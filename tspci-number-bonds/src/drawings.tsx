/*
 * The two drawings, as in the textbooks: the split house (a roof with a chimney, the whole in the roof, rows of two
 * boxes below) and the number bond tree (a box on top, legs down to its parts). They only draw: what goes in a box
 * (an input for the pupil, the author's input in the authoring mode) comes from renderBox.
 */
import type { ComponentChildren } from "preact";
import { Model, treeLayout } from "./bonds";
import type { Texts } from "./texts";

type DrawingProps = {
  model: Model;
  /** the content of box `index`; it fills the box (styles.css .box) */
  renderBox: (index: number, label: string) => ComponentChildren;
  t: Texts;
  /** next to a row of the house (the authoring mode: remove it) */
  rowAside?: (row: number) => ComponentChildren;
};

/** The accessible name of a box: "roof", "row 2, left"; "top", "split 1, right leg". */
export function boxLabel(model: Model, index: number, t: Texts): string {
  if (index === 0) return model.kind === "house" ? t.roof : t.top;
  if (model.kind === "house") return t.rowBox(Math.floor((index - 1) / 2) + 1, (index - 1) % 2);
  const split = model.sums.findIndex((sum) => sum.parts.includes(index));
  const { parts } = model.sums[split];
  return t.leg(split + 1, parts.indexOf(index), parts.length);
}

export const Drawing = (props: DrawingProps) => (props.model.kind === "house" ? <HouseDrawing {...props} /> : <TreeDrawing {...props} />);

/** The split house: the roof (with the whole), and a row of two boxes per sum. */
function HouseDrawing({ model, renderBox, t, rowAside }: DrawingProps) {
  return (
    <div role="group" aria-label={t.house} className="house">
      <div className="roof">
        <svg viewBox="0 0 140 64" aria-hidden="true" className="roof-shape">
          {/* the chimney, behind the roof */}
          <rect x="98" y="6" width="14" height="40" rx="1.5" className="chimney" />
          <rect x="95" y="3" width="20" height="7" rx="2" className="chimney-top" />
          <path d="M 4 61 L 70 4 L 136 61 Z" className="roof-tiles" />
        </svg>
        <div className="roof-box">{renderBox(0, boxLabel(model, 0, t))}</div>
      </div>
      <div className="walls">
        {model.sums.map((sum, row) => (
          <div key={row} className="floor">
            {sum.parts.map((index) => (
              <div key={index} className="room">
                {renderBox(index, boxLabel(model, index, t))}
              </div>
            ))}
            {rowAside && <div className="row-aside">{rowAside(row)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// The tree in em: a slot per part without a split of its own, a level per split
const SLOT = 6;
const LEVEL = 5.5;
const BOX_W = 4.6;
const BOX_H = 2.8;

/** The number bond tree: every box above the middle of its parts, a leg from the box to each part. */
function TreeDrawing({ model, renderBox, t }: DrawingProps) {
  const { at, width, height } = treeLayout(model);
  const w = width * SLOT;
  const h = (height - 1) * LEVEL + BOX_H;
  const x = (index: number) => at[index].x * SLOT;
  const y = (index: number) => at[index].y * LEVEL;
  // the SVG in tenths of an em, so its lines meet the boxes, which are placed in em
  return (
    <div role="group" aria-label={t.tree} className="tree" style={{ width: `${w}em`, height: `${h}em` }}>
      <svg viewBox={`0 0 ${w * 10} ${h * 10}`} aria-hidden="true" className="legs">
        {model.sums.flatMap((sum) =>
          sum.parts.map((part) => (
            <line key={`${sum.whole}-${part}`} x1={x(sum.whole) * 10} y1={(y(sum.whole) + BOX_H) * 10} x2={x(part) * 10} y2={y(part) * 10} />
          ))
        )}
      </svg>
      {model.given.map((_, index) => (
        <div
          key={index}
          className={`tree-box ${index === 0 ? "tree-top" : ""}`}
          style={{ left: `${x(index) - BOX_W / 2}em`, top: `${y(index)}em`, width: `${BOX_W}em`, height: `${BOX_H}em` }}
        >
          {renderBox(index, boxLabel(model, index, t))}
        </div>
      ))}
    </div>
  );
}
