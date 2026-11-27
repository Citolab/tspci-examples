/*
 * The authoring mode (index.tsx getAuthoringInstance): the item author picks the currency (euro, dollar, pound or one of
 * their own: its sign, where the sign goes, its minor unit) and sets up its coins and notes. Every coin and note is drawn
 * as the pupil will see it; per coin or note the author says whether the pupil can take it, whether it is a coin or a
 * note, its colour (a metal or any colour) and how many the supply has. They add a coin or note of any value, or remove
 * one. Below the list: what keeps Done from finishing. It writes the settings currency, currencySign, currencyPosition,
 * minorUnit and pieces.
 */
import type { ComponentChildren } from "preact";
import type { PciProperties } from "@citolab/tspci";
import { useRef, useState } from "preact/hooks";
import configProps from "./config.json";
import {
  Currency, CurrencyCode, Kind, METALS, NOTE_COLORS, PieceDef, Problem, amountText, authoringProblems, currencyFrom, defaultLook, defaultPieces,
  formatAmount, hasMinor, isMetal, isPossibleValue, minorText, newPiece, parseAmount, parseCurrencyCode, parsePieceDefs, serializePieces, taskFrom,
} from "./money";
import { METAL_SWATCH } from "./look";
import { Piece } from "./pieces";
import { Language, problemText, textsFor, valueName } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

/** A coin or note in the list, with an id of its own: two may have the same value while the author works. */
export type Row = PieceDef & { id: number };

/** What the author makes. `kept`: the coins and notes of each currency as the author left them, while the window is open. */
export type Authored = {
  currency: CurrencyCode;
  sign: string;
  position: "before" | "after";
  minor: string;
  rows: Row[];
  kept: Partial<Record<CurrencyCode, Row[]>>;
};

let nextId = 1;
const rowsOf = (defs: PieceDef[]): Row[] => defs.map((def) => ({ ...def, id: nextId++ }));

export const currencyOf = (a: Pick<Authored, "currency" | "sign" | "position" | "minor">): Currency =>
  currencyFrom({ currency: a.currency, currencySign: a.sign, currencyPosition: a.position, minorUnit: a.minor });

/** The authoring mode starts from the settings; coins and notes that can not be read: the currency's defaults. */
export function authoredFrom(properties: Partial<PropTypes>): Authored {
  const p = properties as Record<string, string | undefined>;
  const base = {
    currency: parseCurrencyCode(p.currency),
    sign: String(p.currencySign ?? "").trim(),
    position: p.currencyPosition === "after" ? ("after" as const) : ("before" as const),
    minor: String(p.minorUnit ?? "").trim(),
  };
  const rows = rowsOf(parsePieceDefs(p.pieces, currencyOf(base)));
  return { ...base, rows, kept: { [base.currency]: rows } };
}

/** The settings the authoring mode writes, as strings. */
export const authoredProperties = (a: Authored): Record<string, string> => ({
  currency: a.currency,
  currencySign: a.sign,
  currencyPosition: a.position,
  minorUnit: a.minor,
  pieces: serializePieces(a.rows),
});

const TEXTS = {
  en: {
    title: "Coins and notes",
    intro: "Choose the currency and set up its coins and notes. Each one is drawn as the pupil will see it.",
    currency: "Currency",
    currencies: { eur: "Euro (€)", usd: "US dollar ($)", gbp: "British pound (£)", custom: "Other currency" } as Record<CurrencyCode, string>,
    switchNote: "A currency starts with its usual coins and notes. Choose a currency again to get back what you set up for it (until you close this window).",
    reset: "Back to the usual coins and notes",
    sign: "Sign",
    signHint: "e.g. kr, R$, ₣",
    place: "Place",
    before: "Before the amount",
    after: "After the amount",
    minor: "Minor unit",
    minorHint: "A hundredth of the main unit, e.g. øre, ct, ¢. Empty: none.",
    looks: (examples: string) => `Amounts look like ${examples}.`,
    list: "The coins and notes",
    offered: "The pupil can take it",
    kind: "Kind",
    coin: "Coin",
    note: "Note",
    color: "Colour",
    metals: { copper: "Copper", gold: "Gold", silver: "Silver", silverInGold: "Two metals: silver in gold", goldInSilver: "Two metals: gold in silver" } as Record<string, string>,
    colors: {
      grey: "Grey", red: "Red", blue: "Blue", orange: "Orange", green: "Green", yellow: "Yellow", purple: "Purple", teal: "Teal", pink: "Pink", brown: "Brown", dollar: "Dollar green",
    } as Record<string, string>,
    otherColor: "Other colour",
    number: "Number",
    numberHint: "empty: as many as needed",
    unlimited: "unlimited",
    remove: (piece: string) => `Remove the ${piece}`,
    sameValue: "Same value as another one",
    badValue: "Not a possible value",
    add: "Add a coin or note",
    value: "Value",
    valueHint: (example: string) => `e.g. ${example}`,
    notAValue: "Not an amount of this currency.",
    addButton: "Add",
    ready: (offered: number, all: number) => `Ready: the pupil can take ${offered} of the ${all} coins and notes.`,
    cannotPay: (amount: string) => `The amount of the task, ${amount}, can not be paid with the coins and notes the pupil can take.`,
  },
  nl: {
    title: "Munten en biljetten",
    intro: "Kies de munteenheid en stel de munten en biljetten in. Elke munt en elk biljet staat er zoals de leerling het ziet.",
    currency: "Munteenheid",
    currencies: { eur: "Euro (€)", usd: "Amerikaanse dollar ($)", gbp: "Britse pond (£)", custom: "Andere munteenheid" } as Record<CurrencyCode, string>,
    switchNote: "Een munteenheid begint met de gewone munten en biljetten. Kies een munteenheid opnieuw om terug te krijgen wat je ervoor had ingesteld (tot je dit venster sluit).",
    reset: "Terug naar de gewone munten en biljetten",
    sign: "Teken",
    signHint: "bijv. kr, R$, ₣",
    place: "Plaats",
    before: "Voor het bedrag",
    after: "Na het bedrag",
    minor: "Kleine eenheid",
    minorHint: "Een honderdste van de hoofdeenheid, bijv. øre, ct, ¢. Leeg: geen.",
    looks: (examples: string) => `Bedragen zien eruit als ${examples}.`,
    list: "De munten en biljetten",
    offered: "De leerling kan het pakken",
    kind: "Soort",
    coin: "Munt",
    note: "Biljet",
    color: "Kleur",
    metals: { copper: "Koper", gold: "Goud", silver: "Zilver", silverInGold: "Twee metalen: zilver in goud", goldInSilver: "Twee metalen: goud in zilver" } as Record<string, string>,
    colors: {
      grey: "Grijs", red: "Rood", blue: "Blauw", orange: "Oranje", green: "Groen", yellow: "Geel", purple: "Paars", teal: "Blauwgroen", pink: "Roze", brown: "Bruin", dollar: "Dollargroen",
    } as Record<string, string>,
    otherColor: "Andere kleur",
    number: "Aantal",
    numberHint: "leeg: zoveel als nodig",
    unlimited: "onbeperkt",
    remove: (piece: string) => `De ${piece} verwijderen`,
    sameValue: "Zelfde waarde als een andere",
    badValue: "Geen mogelijke waarde",
    add: "Een munt of biljet toevoegen",
    value: "Waarde",
    valueHint: (example: string) => `bijv. ${example}`,
    notAValue: "Geen bedrag in deze munteenheid.",
    addButton: "Toevoegen",
    ready: (offered: number, all: number) => `Klaar: de leerling kan ${offered} van de ${all} munten en biljetten pakken.`,
    cannotPay: (amount: string) => `Het bedrag van de opdracht, ${amount}, kan niet betaald worden met de munten en biljetten die de leerling kan pakken.`,
  },
};

/** What keeps Done from finishing, in the author's language. `properties`: the item's other settings (task, amount, …). */
export function authoredProblems(a: Authored, properties: Partial<PropTypes>, language: Language): string[] {
  const settings = { ...(properties as Record<string, string>), ...authoredProperties(a) };
  const currency = currencyOf(a);
  const t = textsFor(language, { currency, pieces: a.rows });
  const model = taskFrom({ ...settings, pieces: serializePieces(a.rows.filter((r) => isPossibleValue(r.value, currency))) });
  return authoringProblems(settings, a.rows).map((problem: Problem) => {
    if (problem === "cannotPay" && model.asked !== null) return TEXTS[language].cannotPay(formatAmount(model.asked, language, currency));
    return problemText(problem, t, model);
  });
}

type Props = {
  initial: Authored;
  /** The item's other settings: the task and its amounts, to check them against the coins and notes. */
  properties: Partial<PropTypes>;
  language: Language;
  onChange: (authored: Authored) => void;
};

export function Authoring({ initial, properties, language, onChange }: Props) {
  const [a, setA] = useState(initial);
  const t = TEXTS[language];
  const currency = currencyOf(a);
  const pt = textsFor(language, { currency, pieces: a.rows });
  const change = (next: Partial<Authored>) => {
    const value = { ...a, ...next };
    value.kept = { ...value.kept, [value.currency]: value.rows };
    setA(value);
    onChange(value);
  };

  const chooseCurrency = (code: CurrencyCode) => {
    if (code === a.currency) return;
    const kept = { ...a.kept, [a.currency]: a.rows };
    change({ currency: code, rows: kept[code] ?? rowsOf(defaultPieces(currencyOf({ ...a, currency: code }))), kept });
  };
  const setRow = (id: number, next: Partial<PieceDef>) => change({ rows: a.rows.map((r) => (r.id === id ? { ...r, ...next } : r)) });

  // ---- removing: the focus goes to the next row (or the one before, or the value of a new one) ----
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const remove = (id: number) => {
    const index = a.rows.findIndex((r) => r.id === id);
    const rows = a.rows.filter((r) => r.id !== id);
    change({ rows });
    const target = rows[index] ?? rows[index - 1];
    setTimeout(() => {
      const next = target && listRef.current?.querySelector<HTMLElement>(`[data-row="${target.id}"] [data-remove]`);
      (next ?? addRef.current)?.focus();
    }, 0);
  };

  // ---- adding ----
  const [newValue, setNewValue] = useState("");
  const [newKind, setNewKind] = useState<Kind | null>(null);
  const parsed = parseAmount(newValue, currency);
  const addable = parsed !== null && parsed > 0;
  const kindOfNew: Kind = newKind ?? (parsed !== null && parsed > 200 ? "note" : "coin");
  const add = () => {
    if (!addable) return;
    const row: Row = { ...newPiece(parsed!, currency, kindOfNew), id: nextId++ };
    change({ rows: [...a.rows, row].sort((x, y) => x.value - y.value) });
    setNewValue("");
    setNewKind(null);
  };

  const problems = authoredProblems(a, properties, language);
  const values = a.rows.map((r) => r.value);
  const example = (cents: number) => formatAmount(cents, language, currency);
  const examples = hasMinor(currency) ? `${example(735)} ${language === "nl" ? "en" : "and"} ${minorText(50, currency)}` : example(700);

  return (
    <div className="p-5 font-sans text-ink">
      <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
      <p className="text-slate-600">{t.intro}</p>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Options label={t.currency} name="currency">
          {(["eur", "usd", "gbp", "custom"] as CurrencyCode[]).map((code) => (
            <Option key={code} label={t.currencies[code]} checked={a.currency === code} onSelect={() => chooseCurrency(code)} />
          ))}
        </Options>
        <div className="flex flex-wrap items-center gap-3 pl-[7.5em] text-sm text-slate-600">
          <p className="max-w-[46em]" data-switch-note>
            {t.switchNote}
          </p>
          <button type="button" className="author-button" onClick={() => change({ rows: rowsOf(defaultPieces(currency)) })}>
            {t.reset}
          </button>
        </div>

        {a.currency === "custom" && (
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-3" data-custom>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="author-sign" className="w-[7em] shrink-0 text-sm font-semibold text-slate-600">
                {t.sign}
              </label>
              <input
                type="text"
                className="author-input w-[6em]"
                maxLength={6}
                id="author-sign"
                placeholder="kr"
                value={a.sign}
                aria-describedby="sign-hint"
                onInput={(e) => change({ sign: e.currentTarget.value.trim() })}
              />
              <span id="sign-hint" className="text-sm text-slate-500">
                {t.signHint}
              </span>
            </div>
            <Options label={t.place} name="position">
              {(["before", "after"] as const).map((position) => (
                <Option
                  key={position}
                  label={`${t[position]}: ${formatAmount(hasMinor(currency) ? 735 : 700, language, { ...currency, sign: currency.sign || "kr", position })}`}
                  checked={a.position === position}
                  onSelect={() => change({ position })}
                />
              ))}
            </Options>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="author-minor" className="w-[7em] shrink-0 text-sm font-semibold text-slate-600">
                {t.minor}
              </label>
              <input
                type="text"
                className="author-input w-[6em]"
                maxLength={8}
                id="author-minor"
                placeholder="øre"
                value={a.minor}
                aria-describedby="minor-hint"
                onInput={(e) => change({ minor: e.currentTarget.value.trim() })}
              />
              <span id="minor-hint" className="text-sm text-slate-500">
                {t.minorHint}
              </span>
            </div>
            <p className="pl-[7.5em] text-sm" data-examples>
              {t.looks(examples)}
            </p>
          </div>
        )}
      </div>

      <h3 className="mt-5 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.list}</h3>
      <ul ref={listRef} className="mt-2 flex flex-col gap-2" aria-label={t.list}>
        {a.rows.map((row) => {
          const name = pt.piece(row.value);
          const twice = values.filter((v) => v === row.value).length > 1;
          const impossible = !isPossibleValue(row.value, currency);
          return (
            <li key={row.id} data-row={row.id} data-value={row.value} className={`author-row ${twice || impossible ? "author-row-problem" : ""} ${row.offered ? "" : "author-row-off"}`}>
              <div className="flex min-h-[4.5em] items-center justify-center" aria-hidden="true">
                <Piece def={row} currency={currency} scale={0.8} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="min-w-[6.5em] text-[1.05em] font-bold" data-name>
                    {valueName(row.value, currency, language)}
                  </span>
                  <label className="flex min-h-6 cursor-pointer items-center gap-1.5 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-accent" checked={row.offered} aria-label={`${t.offered}: ${name}`} onChange={(e) => setRow(row.id, { offered: e.currentTarget.checked })} />
                    <span aria-hidden="true">{t.offered}</span>
                  </label>
                  <Options label={`${t.kind}: ${valueName(row.value, currency, language)}`} name="kind" compact>
                    {(["coin", "note"] as Kind[]).map((kind) => (
                      <Option key={kind} label={t[kind]} checked={row.kind === kind} onSelect={() => setRow(row.id, defaultLook(row.value, kind, currency))} />
                    ))}
                  </Options>
                  <label className="flex items-center gap-1.5 text-sm">
                    <span aria-hidden="true">{t.number}</span>
                    <input
                      type="number"
                      className="author-input w-[7.5em]"
                      min={0}
                      max={999}
                      step={1}
                      inputMode="numeric"
                      placeholder={t.unlimited}
                      aria-label={`${t.number}: ${name} (${t.numberHint})`}
                      value={row.count === null ? "" : String(row.count)}
                      onInput={(e) => {
                        const text = e.currentTarget.value.trim();
                        const n = Number(text);
                        if (text === "") setRow(row.id, { count: null });
                        else if (Number.isInteger(n) && n >= 0) setRow(row.id, { count: Math.min(n, 999) });
                      }}
                    />
                  </label>
                  <button type="button" data-remove className="author-button ml-auto h-8 w-8 p-0 text-lg leading-none" aria-label={t.remove(name)} title={t.remove(name)} onClick={() => remove(row.id)}>
                    ×
                  </button>
                </div>
                <ColorChoice row={row} label={`${t.color}: ${name}`} t={t} onChange={(color) => setRow(row.id, { color })} />
                {(twice || impossible) && <p className="text-sm font-semibold text-red-700">{twice ? t.sameValue : t.badValue}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      <form
        className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3"
        aria-label={t.add}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <span className="text-sm font-semibold text-slate-600">{t.add}</span>
        <input
          ref={addRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="author-input w-[8em]"
          aria-label={t.value}
          placeholder={t.valueHint(hasMinor(currency) ? amountText(25, language, currency) : "25")}
          value={newValue}
          aria-invalid={newValue.trim() !== "" && !addable}
          onInput={(e) => setNewValue(e.currentTarget.value)}
          data-new-value
        />
        <Options label={t.kind} name="newKind" compact>
          {(["coin", "note"] as Kind[]).map((kind) => (
            <Option key={kind} label={t[kind]} checked={kindOfNew === kind} onSelect={() => setNewKind(kind)} />
          ))}
        </Options>
        <button type="submit" className="author-button px-3 font-semibold" disabled={!addable}>
          + {t.addButton}
        </button>
        {newValue.trim() !== "" && !addable && <span className="text-sm text-red-700">{t.notAValue}</span>}
      </form>

      <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm" role="status" data-problems>
        {problems.length ? (
          <ul className="list-disc pl-5 text-red-700">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : (
          <p className="text-accent">{t.ready(a.rows.filter((r) => r.offered && r.count !== 0).length, a.rows.length)}</p>
        )}
      </div>
    </div>
  );
}

type AuthorTexts = (typeof TEXTS)["en"];

/**
 * The colour of a coin or note: named swatches (a coin's metals, a note's colours) as radio buttons, and any other
 * colour with the colour picker of the browser.
 */
function ColorChoice({ row, label, t, onChange }: { row: Row; label: string; t: AuthorTexts; onChange: (color: string) => void }) {
  const named: { id: string; label: string; swatch: [string, string] }[] =
    row.kind === "coin"
      ? METALS.map((metal) => ({ id: metal, label: t.metals[metal], swatch: METAL_SWATCH[metal] }))
      : Object.entries(NOTE_COLORS).map(([name, hex]) => ({ id: hex, label: t.colors[name], swatch: [hex, hex] }));
  const other = !named.some((n) => n.id === row.color);
  const picked = isMetal(row.color) ? "#d5dade" : row.color;
  return (
    <Options label={label} name="color" compact>
      {named.map((n) => (
        <Option key={n.id} label={n.label} checked={row.color === n.id} tabbable={other && n === named[0]} onSelect={() => onChange(n.id)} swatch>
          <span className="relative block h-6 w-6 rounded-full border border-black/25" style={{ backgroundColor: n.swatch[0] }}>
            {n.swatch[0] !== n.swatch[1] && <span className="absolute inset-[5px] rounded-full border border-black/25" style={{ backgroundColor: n.swatch[1] }} />}
          </span>
        </Option>
      ))}
      <input
        type="color"
        aria-label={`${label}: ${t.otherColor}`}
        title={t.otherColor}
        value={picked}
        onInput={(e) => onChange(e.currentTarget.value.toLowerCase())}
        className={`h-8 w-10 cursor-pointer rounded-md border-2 bg-white p-0.5 ${other ? "border-accent ring-2 ring-accent-soft" : "border-slate-300"}`}
        data-other-color
      />
    </Options>
  );
}

/**
 * A row of options of which one is picked: a radio group (ARIA pattern) with its name in front. Only the picked one is
 * in the tab order; the arrow keys move the choice, Home and End go to the first and last.
 */
function Options({ label, name, compact, children }: { label: string; name: string; compact?: boolean; children: ComponentChildren }) {
  const onKeyDown = (e: KeyboardEvent) => {
    const group = e.currentTarget as HTMLElement;
    const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
    const at = radios.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: radios.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = radios[(to + radios.length) % radios.length];
    next.click();
    next.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} data-group={name} className="flex flex-wrap items-center gap-1.5" onKeyDown={onKeyDown}>
      {!compact && (
        <span className="w-[7em] shrink-0 text-sm font-semibold text-slate-600" aria-hidden="true">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/** One option of a row: its name, or (a swatch) only a colour, with the name for a screen reader and as a tooltip. */
function Option({ label, checked, tabbable, onSelect, swatch, children }: {
  label: string;
  checked: boolean;
  /** in the tab order although not picked: the first of a row where none is picked */
  tabbable?: boolean;
  onSelect: () => void;
  swatch?: boolean;
  children?: ComponentChildren;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={swatch ? label : undefined}
      title={swatch ? label : undefined}
      tabIndex={checked || tabbable ? 0 : -1}
      onClick={onSelect}
      className={`min-h-8 cursor-pointer border-2 bg-white text-sm transition-colors ${swatch ? "rounded-full p-[2px]" : "rounded-md px-2.5 py-1"} ${
        checked ? "border-accent bg-accent-soft font-semibold text-accent ring-2 ring-accent-soft" : "border-slate-300 text-slate-700 hover:border-slate-500"
      }`}
    >
      {children ?? label}
    </button>
  );
}
