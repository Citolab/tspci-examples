import { Language, Range, formatNumber, snap } from "./settings";
import { Texts } from "./texts";

// A knob: a native range input (arrow keys, Page Up/Down, Home/End, dragging) with a button on each side for one fine
// step. With hidden values the input tells a screen reader its position, not its value.

const button =
  "grid size-9 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-lg leading-none text-slate-700 " +
  "shadow-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

const Knob = ({ id, label, unit, value, range, showValue, language, texts, disabled, onChange }: {
  id: string;
  label: string;
  unit: string;
  value: number;
  range: Range;
  showValue: boolean;
  language: Language;
  texts: Texts;
  disabled?: boolean;
  onChange: (value: number) => void;
}) => {
  const steps = Math.round((range.max - range.min) / range.step);
  const position = Math.round((value - range.min) / range.step);
  const text = `${formatNumber(value, range.decimals, language)} ${unit}`;
  const set = (n: number) => {
    const next = snap(n, range);
    if (next !== value) onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5" data-testid={`knob-${id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label htmlFor={`osc-${id}`} className="text-sm font-medium text-slate-800">{label}</label>
        {showValue && <output htmlFor={`osc-${id}`} className="whitespace-nowrap font-mono text-sm tabular-nums text-emerald-800" data-testid={`value-${id}`}>{text}</output>}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={button} aria-label={texts.lower(label)} disabled={disabled || value <= range.min}
          onClick={() => set(value - range.step)} data-testid={`${id}-down`}>−</button>
        <input id={`osc-${id}`} type="range" className="osc-range min-w-0 flex-1" min={range.min} max={range.max} step={range.step}
          value={value} disabled={disabled} aria-valuetext={showValue ? text : texts.position(position + 1, steps + 1)}
          style={{ "--fill": `${(100 * (value - range.min)) / (range.max - range.min)}%` }}
          onInput={(e) => set(Number((e.target as HTMLInputElement).value))} data-testid={`slider-${id}`} />
        <button type="button" className={button} aria-label={texts.higher(label)} disabled={disabled || value >= range.max}
          onClick={() => set(value + range.step)} data-testid={`${id}-up`}>+</button>
      </div>
    </div>
  );
};

export default Knob;
