import { useRef, useState } from "preact/hooks";
import { Design, Item, MAX_BALLS, MAX_SECTORS, Setup, paletteOf } from "./chance";
import { button } from "./experiment";
import type { Texts } from "./texts";
import { Bag, Ball, fillOf, sectorPath } from "./view";

// Design mode: the candidate makes a spinner of equal sectors (choose a colour, colour sectors) or fills a bag
// (a count per colour). The design is the answer; its probabilities are not shown.

const point = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [110 + r * Math.sin(a), 110 - r * Math.cos(a)];
};

const SpinnerDesign = ({ setup, design: shown, latest, t, readOnly, onChange, say }: {
  setup: Setup; design: Design; latest: () => Design; t: Texts; readOnly: boolean; onChange: (d: Design) => void; say: (m: string) => void;
}) => {
  const palette = paletteOf(setup);
  const [paint, setPaint] = useState(palette[0]?.label ?? "");
  const [focus, setFocus] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const n = shown.sectors.length;
  const item = (label: string): Item => palette.find((p) => p.label === label) ?? palette[0];
  const colour = (i: number) => {
    const design = latest(); // from the store, not this render: quick changes must not undo each other
    if (readOnly || design.sectors[i] === paint) return;
    onChange({ ...design, sectors: design.sectors.map((s, k) => (k === i ? paint : s)) });
    say(t.painted(i + 1, paint));
  };
  const resize = (m: number) => {
    const design = latest();
    const n = design.sectors.length;
    const next = Math.max(1, Math.min(MAX_SECTORS, m));
    if (next === n || readOnly) return;
    const sectors = next > n ? [...design.sectors, ...Array(next - n).fill(paint)] : design.sectors.slice(0, next);
    onChange({ ...design, sectors });
    setFocus((f) => Math.min(f, next - 1));
    say(t.resized(next));
  };
  const move = (i: number) => {
    const k = (i + n) % n;
    setFocus(k);
    (svg.current?.querySelector(`[data-sector="${k}"]`) as SVGElement | null)?.focus();
  };
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(n - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); colour(i); }
  };
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex flex-col items-center gap-3">
        <svg ref={svg} viewBox="0 0 220 220" width="240" height="240" className="max-w-full" role="group" aria-label={t.yourSpinner} data-testid="design-spinner">
          <circle cx="110" cy="110" r="104" fill="#fff" stroke="#cbd5e1" stroke-width="2" />
          {shown.sectors.map((label, i) => {
            const a0 = (i * 360) / n, a1 = ((i + 1) * 360) / n;
            const [lx, ly] = point(66, (a0 + a1) / 2);
            const it = item(label);
            return (
              <g key={i} role="button" tabIndex={readOnly ? -1 : i === focus ? 0 : -1} data-sector={i} aria-label={t.sector(i + 1, n, label)}
                aria-disabled={readOnly ? "true" : undefined} className="cp-sector cursor-pointer outline-none"
                onClick={() => { setFocus(i); colour(i); }} onKeyDown={onKey(i)} onFocus={() => setFocus(i)}>
                <path d={sectorPath(110, 110, 100, a0, a1)} fill={fillOf(it.color)} stroke="#fff" stroke-width="2" />
                {360 / n >= 14 && (
                  <text x={lx} y={ly} text-anchor="middle" dominant-baseline="central" font-size={n > 12 ? 11 : 16} font-weight="700" fill="#fff"
                    stroke="#1e293b" stroke-width="2.5" paint-order="stroke" style={{ pointerEvents: "none" }}>{it.letter}</text>
                )}
              </g>
            );
          })}
          <circle cx="110" cy="110" r="6" fill="#0f172a" />
        </svg>
        <div className="flex items-center gap-2">
          <button type="button" className={button} aria-label={t.fewer} disabled={readOnly || n <= 1} onClick={() => resize(n - 1)}>−</button>
          <span className="min-w-20 text-center text-sm font-medium tabular-nums text-slate-700" data-testid="sector-count">{t.sectors(n)}</span>
          <button type="button" className={button} aria-label={t.moreSectors} disabled={readOnly || n >= MAX_SECTORS} onClick={() => resize(n + 1)}>+</button>
        </div>
      </div>
      <div className="flex max-w-xs flex-col gap-3">
        <fieldset className="flex flex-wrap gap-2" disabled={readOnly}>
          <legend className="mb-2 text-sm font-semibold text-slate-700">{t.paint}</legend>
          {palette.map((p) => (
            <label key={p.label} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white py-1 pr-3 pl-1 text-sm has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50 has-[:checked]:ring-2 has-[:checked]:ring-sky-700 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sky-700">
              <input type="radio" name="cp-paint" className="sr-only" value={p.label} checked={paint === p.label} onChange={() => setPaint(p.label)} />
              <Ball item={p} size={26} />
              {p.label}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-slate-500">{t.spinnerHelp}</p>
      </div>
    </div>
  );
};

const BagDesign = ({ setup, design, latest, t, readOnly, onChange, say }: {
  setup: Setup; design: Design; latest: () => Design; t: Texts; readOnly: boolean; onChange: (d: Design) => void; say: (m: string) => void;
}) => {
  const palette = paletteOf(setup);
  const total = design.counts.reduce((a, b) => a + b, 0);
  const set = (i: number, value: number) => {
    const now = latest(); // from the store, not this render
    const others = now.counts.reduce((a, b) => a + b, 0) - now.counts[i];
    const next = Math.max(0, Math.min(MAX_BALLS - others, Math.round(value)));
    if (!Number.isFinite(next) || next === now.counts[i] || readOnly) return;
    onChange({ ...now, counts: now.counts.map((c, k) => (k === i ? next : c)) });
    say(t.counted(palette[i].label, next, others + next));
  };
  const balls = palette.map((p, i) => ({ ...p, count: design.counts[i] ?? 0 }));
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex flex-col items-center gap-2">
        <Bag balls={balls} label={t.bagImage(balls.filter((b) => b.count).map((b) => `${b.count} × ${b.label}`).join(", ") || "–")} />
        <p className="text-sm font-medium tabular-nums text-slate-700" data-testid="ball-count">{t.balls(total)}</p>
      </div>
      <ul className="flex flex-col gap-2" aria-label={t.yourBag}>
        {palette.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2">
            <Ball item={p} size={28} />
            <span className="w-24 text-sm text-slate-800">{p.label}</span>
            <button type="button" className={button} aria-label={t.oneLess(p.label)} disabled={readOnly || !design.counts[i]} onClick={() => set(i, latest().counts[i] - 1)}>−</button>
            <input type="number" min={0} max={MAX_BALLS} value={design.counts[i]} disabled={readOnly} aria-label={t.howMany(p.label)}
              className="w-16 rounded-md border border-slate-300 px-2 py-1 text-center tabular-nums focus-visible:outline-2 focus-visible:outline-sky-700"
              onChange={(e) => set(i, Number((e.target as HTMLInputElement).value))} />
            <button type="button" className={button} aria-label={t.oneMore(p.label)} disabled={readOnly || total >= MAX_BALLS} onClick={() => set(i, latest().counts[i] + 1)}>+</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const DesignEditor = (props: {
  setup: Setup; design: Design; latest: () => Design; t: Texts; readOnly: boolean; onChange: (d: Design) => void; say: (m: string) => void;
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={props.setup.tool === "bag" ? props.t.yourBag : props.t.yourSpinner}
    data-testid="design">
    <h3 className="mb-3 text-sm font-semibold text-slate-700">{props.setup.tool === "bag" ? props.t.yourBag : props.t.yourSpinner}</h3>
    {props.setup.tool === "bag" ? <BagDesign {...props} /> : <SpinnerDesign {...props} />}
  </section>
);
