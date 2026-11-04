// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Lentillespci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Language, Settings, captionOf, clean, formatValue, niceScale } from "./graph";
import { Texts } from "./texts";

// The measurements as the candidate gets them: a picture per measurement (a sprout next to a ruler, instead of the
// original's photographs) and/or a table with the values.

const CARD_W = 104, CARD_H = 250, SOIL = 222, RULER_H = 190, RULER_X = 10, RULER_W = 30, SPROUT_X = 70;

/** One picture: the ruler from 0 to the top of the scale, a seed in the soil and a sprout up to the measured value. */
const Sprout = ({ value, top, step, unit, label, language }: { value: number; top: number; step: number; unit: string; label: string; language: Language }) => {
  const perUnit = RULER_H / top;
  const h = Math.max(0, Math.min(top, value)) * perUnit;
  const tip = SOIL - h;
  // the ticks: every step labelled, half steps longer, tenths when they are far enough apart
  const minor = step / 10 * perUnit >= 3 ? step / 10 : step / 2;
  const ticks = Array.from({ length: Math.round(top / minor) + 1 }, (_, i) => clean(i * minor));
  const isMajor = (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
  const isHalf = (v: number) => Math.abs((2 * v) / step - Math.round((2 * v) / step)) < 1e-6;
  const sway = Math.min(8, h / 6);
  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} width={CARD_W} height={CARD_H} role="img" aria-label={label} className="block">
      <rect x="0" y={SOIL} width={CARD_W} height={CARD_H - SOIL} fill="#d6c3a5" />
      <path d={`M0 ${SOIL}H${CARD_W}`} stroke="#92704a" stroke-width="1.5" />
      {/* the ruler */}
      <rect x={RULER_X} y={SOIL - RULER_H - 8} width={RULER_W} height={RULER_H + 8} rx="2" fill="#fef3c7" stroke="#b45309" stroke-width="1" />
      {ticks.map((v) => {
        const y = SOIL - v * perUnit;
        const len = isMajor(v) ? 10 : isHalf(v) ? 7 : 4;
        return <path key={v} d={`M${RULER_X + RULER_W} ${y}h${-len}`} stroke="#78350f" stroke-width={isMajor(v) ? 1.2 : 0.7} />;
      })}
      {ticks.filter(isMajor).map((v) => (
        <text key={`t${v}`} x={RULER_X + 2} y={SOIL - v * perUnit + 3} font-size="8.5" fill="#78350f" font-family="system-ui, sans-serif">{formatValue(v, language)}</text>
      ))}
      <text x={RULER_X + RULER_W / 2} y={SOIL - RULER_H - 11} font-size="9" text-anchor="middle" fill="#78350f" font-family="system-ui, sans-serif">{unit}</text>
      {/* where the tip is on the ruler */}
      {h > 0 && <path d={`M${RULER_X + RULER_W} ${tip}H${SPROUT_X - 2}`} stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />}
      {/* roots, seed and sprout */}
      <path d={`M${SPROUT_X} ${SOIL + 4}q-3 8 -8 12M${SPROUT_X} ${SOIL + 4}q2 9 6 13`} stroke="#a8a29e" stroke-width="1" fill="none" />
      {h > 0 && (
        <path d={`M${SPROUT_X} ${SOIL}C${SPROUT_X + sway} ${SOIL - h / 3} ${SPROUT_X - sway} ${SOIL - (2 * h) / 3} ${SPROUT_X} ${tip}`}
          stroke="#4d7c0f" stroke-width="2.5" fill="none" stroke-linecap="round" />
      )}
      {h > 12 && (
        <g fill="#65a30d">
          <ellipse cx={SPROUT_X - 6} cy={tip + 5} rx="6" ry="2.6" transform={`rotate(25 ${SPROUT_X - 6} ${tip + 5})`} />
          <ellipse cx={SPROUT_X + 6} cy={tip + 5} rx="6" ry="2.6" transform={`rotate(-25 ${SPROUT_X + 6} ${tip + 5})`} />
        </g>
      )}
      <ellipse cx={SPROUT_X} cy={SOIL + 1} rx="9" ry="5.5" fill="#a16207" stroke="#713f12" stroke-width="0.8" />
    </svg>
  );
};

const Illustration = ({ s, texts }: { s: Settings; texts: Texts }) => {
  const top = niceScale(Math.max(...s.data.map((d) => d.y)));
  const valueText = (y: number) => `${formatValue(y, s.language)} ${s.yUnit}`;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="pictures">
      {s.data.map((d, i) => (
        <li key={i} className="flex flex-col items-center rounded-md border border-slate-200 bg-white p-1 text-[13px]">
          <Sprout value={d.y} top={top.max} step={top.step} unit={s.yUnit} language={s.language} label={texts.cardLabel(captionOf(s, d.x), valueText(d.y))} />
          <span aria-hidden="true" className="font-medium">{captionOf(s, d.x)}</span>
          {s.showValues && <span aria-hidden="true" className="text-slate-600">{valueText(d.y)}</span>}
        </li>
      ))}
    </ul>
  );
};

/** The measurements in a table, read only. */
export const DataTable = ({ s, texts }: { s: Settings; texts: Texts }) => (
  <table className="self-start border-collapse text-[14px]" data-testid="data-table">
    <caption className="sr-only">{texts.measurements}</caption>
    <thead>
      <tr>
        <th scope="col" className="border border-slate-300 bg-slate-100 px-3 py-1 text-left">{`${s.xQuantity} (${s.xUnit})`}</th>
        <th scope="col" className="border border-slate-300 bg-slate-100 px-3 py-1 text-left">{`${s.yQuantity} (${s.yUnit})`}</th>
      </tr>
    </thead>
    <tbody>
      {s.data.map((d, i) => (
        <tr key={i}>
          <td className="border border-slate-300 px-3 py-1 text-right tabular-nums">{formatValue(d.x, s.language)}</td>
          <td className="border border-slate-300 px-3 py-1 text-right tabular-nums">{formatValue(d.y, s.language)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export default Illustration;
