/*
 * The document, drawn from its blocks (documents.ts) as real HTML: a heading, tables with a caption and column and row
 * headers, so a screen reader can read it as a table. Every value is a field: a button the pupil taps (a tap, a click,
 * Enter or Space), or plain text where nothing can be tapped. Arrow keys move to the next or previous field (Up and
 * Down stay in the column of a table), Home and End to the first and last.
 */
import type { ComponentChildren, JSX } from "preact";
import { Block, Cell, Doc, Field, Logo, Panel, showValue } from "./documents";

/** How a field is marked: chosen (find), a mistake (check), where the answer is (answer). */
export type Mark = "chosen" | "mistake" | "source";

type Props = {
  doc: Doc;
  currency: string;
  markOf: (id: string) => Mark | null;
  /** a tap on a field; without it, nothing can be tapped */
  onTap?: (id: string) => void;
  /** which fields can be tapped (default: all) */
  canTap?: (field: Field) => boolean;
  /** the words for a mark, read with the field ("chosen") */
  markText: Record<Mark, string>;
  /** an id for the document's region, so the question can point to it */
  id?: string;
};

export function DocumentView({ doc, currency, markOf, onTap, canTap, markText, id }: Props) {
  const value = (field: Field) => showValue(field, field.shown, doc.language, currency);

  const renderField = (cell: Cell, big = false): ComponentChildren => {
    if (!cell) return null;
    if ("text" in cell) return cell.text;
    const field = doc.byId[cell.field];
    if (!field) return null;
    const mark = markOf(field.id);
    const shown = value(field);
    const className = `field kind-${field.kind}${big ? " big" : ""}${mark ? ` mark mark-${mark}` : ""}${field.kind === "shift" && field.shown === "" ? " off" : ""}`;
    const badge = mark ? <MarkIcon mark={mark} /> : null;
    if (!onTap || (canTap && !canTap(field))) {
      return (
        <span className={`${className} static`} data-field-id={field.id}>
          {shown}
          {badge}
          {mark && <span className="sr-only">{`, ${markText[mark]}`}</span>}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={className}
        data-field={field.id}
        aria-label={`${field.label}: ${shown}`}
        aria-pressed={mark !== null}
        onClick={() => onTap(field.id)}
      >
        {shown}
        {badge}
      </button>
    );
  };

  /** Arrow keys: Left and Right the previous and next field; Up and Down the field above or below in a table. */
  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLElement>) => {
    const from = e.target as HTMLElement;
    if (!from?.dataset?.field || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const root = e.currentTarget;
    const all = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-field]"));
    const i = all.indexOf(from as HTMLButtonElement);
    let next: HTMLElement | undefined;
    if (e.key === "Home") next = all[0];
    else if (e.key === "End") next = all[all.length - 1];
    else if (e.key === "ArrowRight") next = all[i + 1];
    else if (e.key === "ArrowLeft") next = all[i - 1];
    else {
      const step = e.key === "ArrowDown" ? 1 : -1;
      const cell = from.closest("td, th") as HTMLTableCellElement | null;
      const row = cell?.parentElement as HTMLTableRowElement | null;
      const table = row?.closest("table");
      if (cell && row && table) {
        const rows = Array.from(table.rows);
        for (let r = rows.indexOf(row) + step; r >= 0 && r < rows.length; r += step) {
          const button = rows[r].cells[cell.cellIndex]?.querySelector<HTMLElement>("button[data-field]");
          if (button) {
            next = button;
            break;
          }
        }
      }
      next ??= all[i + step];
    }
    e.preventDefault();
    next?.focus();
  };

  return (
    <section id={id} className={`document doc-${doc.template}`} aria-label={doc.name} onKeyDown={onKeyDown}>
      {doc.panels.map((panel, p) => (
        <PanelView key={p} panel={panel}>
          {panel.blocks.map((block, b) => (
            <BlockView key={b} block={block} render={renderField} />
          ))}
        </PanelView>
      ))}
    </section>
  );
}

function PanelView({ panel, children }: { panel: Panel; children: ComponentChildren }) {
  if (panel.kind === "box") {
    return (
      <div className="panel box">
        <div className="box-title">
          <BoxIcon />
          <h3>{panel.title}</h3>
        </div>
        {children}
      </div>
    );
  }
  return <div className="panel paper">{children}</div>;
}

function BlockView({ block, render }: { block: Block; render: (cell: Cell, big?: boolean) => ComponentChildren }) {
  switch (block.type) {
    case "letterhead":
      return (
        <div className="letterhead">
          <LogoIcon logo={block.logo} />
          <div>
            <p className="company">{render(block.name)}</p>
            {block.lines.map((line, i) => (
              <p key={i} className="company-line">
                {render(line)}
              </p>
            ))}
          </div>
        </div>
      );
    case "title":
      return (
        <div className="doc-title">
          {block.badge && <span className="badge-line">{render(block.badge)}</span>}
          <h3>{block.text}</h3>
          {block.cells?.map((cell, i) => (
            <span key={i} className="title-cell">
              {render(cell)}
            </span>
          ))}
        </div>
      );
    case "pairs":
      return (
        <table className="pairs">
          <caption className="sr-only">{block.caption}</caption>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                <th scope="row">{row.label}</th>
                <td>{render(row.cell)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "table":
      return (
        <div className="table-wrap">
          <table className="lines">
            <caption>{block.caption}</caption>
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i} scope="col" className={block.end?.[i] ? "end" : ""}>
                    {render(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className={row.total ? "total" : ""}>
                  {row.cells.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row">
                        {render(cell)}
                      </th>
                    ) : (
                      <td key={i} className={block.end?.[i] ? "end" : ""}>
                        {render(cell)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "big":
      return (
        <div className="big-line">
          <span className="big-label">{block.label}</span>
          {render(block.cell, true)}
        </div>
      );
    case "note":
      return (
        <p className="note">
          {block.cells.map((cell, i) => (
            <span key={i}>
              {i > 0 ? " " : ""}
              {render(cell)}
            </span>
          ))}
        </p>
      );
  }
}

/** The mark on a field: a shape and a colour, never only a colour (a tick, an exclamation mark, a magnifier). */
function MarkIcon({ mark }: { mark: Mark }) {
  return (
    <svg className={`mark-icon mark-icon-${mark}`} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9" />
      {mark === "chosen" && <path d="M5.5 10.5l3 3 6-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />}
      {mark === "mistake" && (
        <>
          <path d="M10 4.8v6.4" stroke="#fff" stroke-width="2.6" stroke-linecap="round" />
          <circle cx="10" cy="14.9" r="1.5" fill="#fff" />
        </>
      )}
      {mark === "source" && (
        <>
          <circle cx="8.8" cy="8.8" r="3.6" fill="none" stroke="#fff" stroke-width="2" />
          <path d="M11.5 11.5l3.4 3.4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
        </>
      )}
    </svg>
  );
}

/** A made-up mark for each made-up company: simple shapes, no real logo. */
function LogoIcon({ logo }: { logo: Logo }) {
  const shapes: Record<Logo, ComponentChildren> = {
    leaf: <path d="M8 30C8 15 18 7 32 7c0 15-9 24-22 24M10 29l12-12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />,
    basket: (
      <>
        <path d="M5 15h30l-4 17H9z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
        <path d="M12 15l6-9M28 15l-6-9M14 21v6M20 21v6M26 21v6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </>
    ),
    tools: (
      <>
        <path d="M9 31l13-13" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <path d="M21 9a7 7 0 0 0 9 9l-4-1-3-3-1-4z" fill="currentColor" />
        <path d="M8 9l7 7M6 11l5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </>
    ),
    cup: (
      <>
        <path d="M7 14h20v8a9 9 0 0 1-9 9h-2a9 9 0 0 1-9-9z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
        <path d="M27 16h3a4 4 0 0 1 0 8h-3M13 5c-2 3 2 4 0 7M19 5c-2 3 2 4 0 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </>
    ),
    bolt: <path d="M22 4L9 22h9l-2 14 13-19h-9z" fill="currentColor" />,
    cross: <path d="M15 5h10v10h10v10H25v10H15V25H5V15h10z" fill="currentColor" />,
  };
  return (
    <svg className={`logo logo-${logo}`} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      {shapes[logo]}
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg className="box-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M5 13l15-7 15 7v16l-15 7-15-7z" fill="#e8c48f" stroke="#7a5426" stroke-width="2" stroke-linejoin="round" />
      <path d="M5 13l15 7 15-7M20 20v16" fill="none" stroke="#7a5426" stroke-width="2" stroke-linejoin="round" />
      <path d="M12 9.5l15 7" stroke="#7a5426" stroke-width="2" />
    </svg>
  );
}
