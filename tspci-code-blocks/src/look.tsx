// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The look of the blocks, shared by the candidate's editor and the authoring mode: puzzle pieces in a colour per
// category (style.css draws the notches, the C-shapes and the hat), with the blanks as pills inside.

import type { JSX } from "preact";
import type { Block, Kind, Node } from "./blocks";
import type { Texts } from "./texts";

export type Category = "variables" | "control" | "io" | "events";

/**
 * The colours of the categories, with a darker shade for dropdowns. White text on them (WCAG AA, normal text):
 * variables 5.34:1, control 4.67:1, io 5.69:1, events 5.00:1; on the dark shades 6.9–8.1:1.
 */
export const CATEGORY: Record<Category, { c: string; dark: string }> = {
  variables: { c: "#C2335F", dark: "#97274A" },
  control: { c: "#B25E00", dark: "#8A4900" },
  io: { c: "#2D5FD3", dark: "#234AA4" },
  events: { c: "#1F7F4C", dark: "#18633B" },
};

export const categoryOf = (kind: Kind): Category => (kind === "set" ? "variables" : kind === "input" || kind === "print" ? "io" : "control");

/** The CSS variables of a piece in a category (style.css: .cb-piece, .cb-arm). */
export const colours = (category: Category) => ({ "--c": CATEGORY[category].c, "--dark": CATEGORY[category].dark }) as JSX.CSSProperties;

const pill = "inline-flex h-7 items-center rounded-full font-semibold";
const textPill = `${pill} border-0 bg-white px-2.5 text-center text-[14px] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.25)] focus:outline-3 focus:outline-offset-1 focus:outline-slate-900 disabled:text-slate-900 disabled:opacity-100`;

/** The label of a block with its blanks: white pills to type in and dark pills to choose from; empty pills in the palette. */
export const Label = ({ block, node, number, texts, disabled, onValue }: {
  block: Block; node?: Node; number?: number; texts: Texts; disabled?: boolean; onValue?: (slot: number, value: string) => void;
}) => {
  let blank = 0;
  return (
    <span data-label className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] leading-7 font-semibold text-white">
      {block.parts.map((p, i) => {
        if (typeof p === "string") return p.trim() ? <span key={i} className="whitespace-pre-wrap">{p.trim()}</span> : null;
        const slot = block.slots[p.slot];
        if (!slot) return null;
        // fixed parts (a variable, an expression) are reporters: a rounded pill
        if (slot.type === "fixed") return <span key={i} className={`${pill} bg-black/20 px-2.5`}>{slot.text}</span>;
        blank++;
        if (!node) {
          return slot.type === "choice"
            ? <span key={i} aria-hidden="true" className={`${pill} w-11 justify-end border border-black/20 bg-[var(--dark)] pr-2 text-xs`}>▾</span>
            : <span key={i} aria-hidden="true" className={`${pill} w-9 bg-white shadow-[inset_0_1px_2px_rgba(15,23,42,0.25)]`} />;
        }
        const value = node.values[p.slot] ?? "";
        const label = texts.blank(blank, number ?? 0);
        if (slot.type === "choice") {
          return (
            <span key={i} className="relative inline-flex">
              <select className={`${pill} cursor-pointer appearance-none border border-black/25 bg-[var(--dark)] pr-7 pl-3 text-[14px] text-white focus:outline-3 focus:outline-offset-1 focus:outline-slate-900 disabled:cursor-default disabled:opacity-100`}
                aria-label={label} value={value} disabled={disabled} onChange={(e) => onValue?.(p.slot, (e.target as HTMLSelectElement).value)}>
                <option value="" className="bg-white text-slate-900">{texts.choose}</option>
                {slot.options.map((o) => <option key={o} value={o} className="bg-white text-slate-900">{o}</option>)}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">▾</span>
            </span>
          );
        }
        return (
          <input key={i} type="text" className={`${textPill} max-w-full`} aria-label={label} value={value} disabled={disabled}
            spellcheck={false} autocomplete="off" autocapitalize="off" maxLength={200}
            style={{ width: `${Math.min(28, Math.max(3.5, value.length + 2))}ch` }}
            onInput={(e) => onValue?.(p.slot, (e.target as HTMLInputElement).value)} />
        );
      })}
    </span>
  );
};

/**
 * A block on its own (the palette, the authoring mode's cards), not interactive: one piece, or for a block that holds
 * blocks a small but complete C: the top piece, a short empty mouth (with the inner tab), the else bar of an if/else
 * and its second mouth, and the bottom bar. The colours come from the element around it (colours()).
 */
export const BlockShape = ({ block, texts }: { block: Block; texts: Texts }) => {
  const label = <Label block={block} texts={texts} />;
  if (!(block.kind === "if" || block.kind === "ifelse" || block.kind === "while" || block.kind === "repeat" || block.kind === "for")) {
    return <span className="cb-piece inline-flex max-w-full items-center px-2.5 py-1.5">{label}</span>;
  }
  return (
    <span className="flex max-w-full flex-col items-start" data-c-shape>
      <span className="cb-piece cb-c-top inline-flex max-w-full items-center px-2.5 py-1.5">{label}</span>
      <span aria-hidden="true" className="cb-arm cb-mouth block" />
      {block.kind === "ifelse" && (
        <>
          <span aria-hidden="true" className="cb-piece cb-c-mid inline-flex items-center px-2.5 py-0.5 text-[13px] font-semibold">{block.elseLabel}</span>
          <span aria-hidden="true" className="cb-arm cb-mouth block" />
        </>
      )}
      <span aria-hidden="true" className="cb-piece cb-c-end block" />
    </span>
  );
};

// ─── icons ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const Icon = ({ d, className = "size-4" }: { d: string; className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d={d} />
  </svg>
);
export const ICON = {
  up: "M8 13V3M3.5 7.5 8 3l4.5 4.5",
  down: "M8 3v10M3.5 8.5 8 13l4.5-4.5",
  indent: "M2 8h8M7 4.5 10.5 8 7 11.5M14 3v10",
  outdent: "M14 8H6M9 4.5 5.5 8 9 11.5M2 3v10",
  remove: "M4 4l8 8M12 4l-8 8",
  play: "M5 3.5v9l7-4.5z",
};
export const Grip = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
    {[4, 8, 12].flatMap((y) => [6, 10].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" />))}
  </svg>
);
export const Lock = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
    <path d="M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7H12.5v7h-9V7zm1.6 0h3.8V5.5a1.9 1.9 0 0 0-3.8 0z" />
  </svg>
);
