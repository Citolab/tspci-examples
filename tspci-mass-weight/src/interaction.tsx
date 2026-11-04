// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/ForceGravitepci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Delorpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { BenchView, scaleText } from "./bench";
import {
  AnswerField, Bench, INSTRUMENTS, InstrumentId, Location, PlaceId, Reading, Settings, Thing, canMove, formatNumber, locationOf, num,
  objectOf, placeOf, readingsOf, unitOf,
} from "./model";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the places, the bench (bench.tsx), a panel per instrument with its buttons and reading, the
// objects with a button per place they can go, and the answer fields the author asked for.

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The name of an object in the candidate's language. */
export const nameOf = (s: Settings, t: Texts, thing: Thing) => (thing.names ? thing.names[s.language] : t.objects[thing.kind]);
/** An object in a sentence: "the statuette", "het beeldje", "la statuette". */
export const theOf = (s: Settings, t: Texts, thing: Thing) => t.the(thing.kind, nameOf(s, t, thing));

/** What an instrument shows, in words. */
export const readingText = (s: Settings, t: Texts, r: Reading) => {
  if (r.note === "off") return t.off;
  if (r.note === "overload") return t.overload;
  if (r.note === "overRange") return t.overRange;
  if (r.note === "aboveScale") return t.aboveScale;
  if (r.note === "overflow") return t.overflow;
  if (r.value === null) return "";
  if (r.instrument === "scale") return scaleText(r.value, s.scaleResolution, s.language);
  const text = `${formatNumber(r.value, s.language, r.instrument === "dynamometer" ? 2 : 1)} ${r.unit}`;
  return r.note === "partly" ? `${text} (${t.partly})` : text;
};

/** The accessible name of the bench: the place, and what is on each instrument and what it shows. */
export const benchLabel = (s: Settings, t: Texts, bench: Bench) => {
  const readings = readingsOf(s, bench);
  const parts = s.instruments.map((i) => {
    const on = s.objects.filter((o) => locationOf(bench, o.id) === i).map((o) => theOf(s, t, o));
    return `${t.instruments[i]}${t.colon}${on.length ? `${on.join(", ")}, ` : ""}${readingText(s, t, readings[i])}.`;
  });
  const table = s.objects.filter((o) => locationOf(bench, o.id) === "table").map((o) => theOf(s, t, o));
  if (table.length) parts.push(`${capital(t.at.table)}${t.colon}${table.join(", ")}.`);
  return t.figure(t.onPlace[bench.place], parts.join(" "));
};

let fields = 0;

const Interaction = ({ prompt, s, store, t, readOnly, uid }: {
  prompt: string;
  s: Settings;
  store: IStore<StateModel, Actions>;
  t: Texts;
  readOnly: boolean;
  uid: string;
}) => {
  const state = useStore(store);
  const [announce, setAnnounce] = useState("");
  const [pouring, setPouring] = useState<number | null>(null);
  const [fieldId] = useState(() => `${uid}-f${++fields}`);
  const water = pouring ?? state.water;
  const readings = readingsOf(s, { ...state, water });
  const place = placeOf(s, state.place);

  /** Says what an instrument shows now (after the store has the action). */
  const tell = (lead: string, instrument?: InstrumentId) => {
    const now = store.getState();
    const r = instrument ? readingsOf(s, now)[instrument] : null;
    setAnnounce([lead, r ? `${t.instruments[instrument!]}${t.colon}${readingText(s, t, r)}.` : ""].filter(Boolean).join(" "));
  };

  const moveObject = (thing: Thing, to: Location) => {
    if (readOnly) return;
    if (!canMove(s, thing.id, to)) {
      if (to === "cylinder") setAnnounce(capital(t.tooBig(theOf(s, t, thing))));
      return;
    }
    store.dispatch({ type: "MOVE", payload: { object: thing.id, to } });
    tell(`${capital(theOf(s, t, thing))} ${t.at[to]}.`, to === "table" ? undefined : to);
  };
  const choosePlace = (id: PlaceId) => {
    if (readOnly || id === state.place) return;
    store.dispatch({ type: "PLACE", payload: { place: id } });
    const now = store.getState();
    const busy = INSTRUMENTS.filter((i) => s.instruments.includes(i) && s.objects.some((o) => locationOf(now, o.id) === i));
    const r = readingsOf(s, now);
    setAnnounce([`${t.welcome[id]}.`, ...busy.map((i) => `${t.instruments[i]}${t.colon}${readingText(s, t, r[i])}.`)].join(" "));
  };
  const power = () => {
    if (readOnly) return;
    store.dispatch({ type: "POWER", payload: {} });
    tell("", "scale");
  };
  const tare = () => {
    if (readOnly) return;
    store.dispatch({ type: "TARE", payload: {} });
    tell("", "scale");
  };
  const pour = (value: number) => {
    setPouring(null);
    if (readOnly || value === state.water) return;
    store.dispatch({ type: "WATER", payload: { water: value } });
    tell("", "cylinder");
  };
  const answer = (field: AnswerField, text: string) => {
    if (readOnly) return;
    store.dispatch({ type: "ANSWER", payload: { field, text } });
  };

  const answerThing = objectOf(s, s.answerObject)!;
  const answerPlace = placeOf(s, s.answerPlace);
  const question = prompt?.trim() ? prompt : t.prompt;
  const button = "rounded-md border px-2.5 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300 disabled:cursor-not-allowed";

  return (
    <div class="mw space-y-3 font-sans text-slate-800" lang={s.language}>
      <div class="text-base" data-testid="prompt">{question}</div>

      <div class="flex flex-wrap items-center gap-3">
        {s.places.length > 1 && (
          <div role="group" aria-label={t.placeGroup} class="flex gap-1.5">
            {s.places.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === state.place} disabled={readOnly}
                class={`${button} ${p.id === state.place ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
                onClick={() => choosePlace(p.id)}>
                {t.places[p.id]}
              </button>
            ))}
          </div>
        )}
        <div class="text-sm font-semibold" data-testid="welcome">
          {t.welcome[place.id]}
          {s.showG && " "}
          {s.showG && <span class="font-normal text-slate-600" data-testid="gravity">({t.gravity(formatNumber(place.g, s.language, 3))})</span>}
        </div>
      </div>

      <div class="overflow-hidden rounded-lg border border-slate-300">
        <BenchView s={s} bench={state} water={water} uid={uid} label={benchLabel(s, t, { ...state, water })} tareLabel={t.tare} readOnly={readOnly}
          onDrop={(id, to) => moveObject(objectOf(s, id)!, to)} onPower={power} onTare={tare} />
      </div>

      <div class="grid gap-2" style={{ gridTemplateColumns: `repeat(${s.instruments.length}, minmax(0, 1fr))` }}>
        {s.instruments.map((i) => (
          <section key={i} aria-label={t.instruments[i]} class="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
            <h3 class="text-sm font-semibold">{t.instruments[i]}</h3>
            <div data-testid={`reading-${i}`} class={s.showReadings || i === "scale" ? "text-sm tabular-nums" : "sr-only"}>
              {t.reading}{t.colon}<span class="font-semibold">{readingText(s, t, readings[i])}</span>
            </div>
            {i === "scale" && (
              <div class="flex flex-wrap gap-1.5">
                {s.scaleOnOff && (
                  <button type="button" class={`${button} border-slate-300 bg-white hover:bg-slate-100`} aria-label={t.powerName}
                    aria-pressed={state.scaleOn} disabled={readOnly} onClick={power}>{t.power}</button>
                )}
                <button type="button" class={`${button} border-slate-300 bg-white hover:bg-slate-100`} aria-label={t.tareName}
                  disabled={readOnly || !state.scaleOn} onClick={tare}>{t.tare}</button>
              </div>
            )}
            {i === "cylinder" && (
              <label class="block text-sm">
                <span>{t.water}</span>
                <input type="range" class="range w-full" min={0} max={s.waterMax} step={s.waterStep} value={water} disabled={readOnly}
                  aria-valuetext={t.waterText(formatNumber(water, s.language, 2))}
                  style={{ "--fill": `${(100 * water) / s.waterMax}%` }}
                  onInput={(e) => setPouring(num((e.target as HTMLInputElement).value) ?? 0)}
                  onChange={(e) => pour(num((e.target as HTMLInputElement).value) ?? 0)} />
              </label>
            )}
          </section>
        ))}
      </div>

      <section aria-labelledby={`${fieldId}-objects`} class="space-y-1.5">
        <h3 id={`${fieldId}-objects`} class="text-sm font-semibold">{t.objectsHeading}</h3>
        <p class="text-sm text-slate-600">{t.dragHint}</p>
        <ul class="space-y-1.5">
          {s.objects.map((thing) => {
            const at = locationOf(state, thing.id);
            return (
              <li key={thing.id} class="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5" data-testid={`row-${thing.id}`}>
                <span class="min-w-40 text-sm"><span class="font-semibold">{capital(nameOf(s, t, thing))}</span> <span class="text-slate-600">{t.at[at]}</span></span>
                <div role="group" aria-label={capital(nameOf(s, t, thing))} class="flex flex-wrap gap-1.5">
                  {(["table", ...s.instruments] as Location[]).map((to) => {
                    const ok = canMove(s, thing.id, to);
                    return (
                      <button key={to} type="button" aria-label={t.moveTo[to](theOf(s, t, thing))} title={ok ? undefined : capital(t.tooBig(theOf(s, t, thing)))}
                        disabled={readOnly || at === to || !ok}
                        class={`${button} ${at === to ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 bg-white hover:bg-slate-100"} disabled:opacity-60`}
                        onClick={() => moveObject(thing, to)}>
                        {t.moveShort[to]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {s.answers.length > 0 && (
        <fieldset class="space-y-2 rounded-lg border border-slate-300 p-3">
          <legend class="px-1 text-sm font-semibold">{t.answersHeading}</legend>
          {s.answers.map((field) => {
            const text = state.answers[field] ?? "";
            const invalid = text.trim() !== "" && num(text) === null;
            const id = `${fieldId}-${field}`;
            return (
              <div key={field} class="flex flex-wrap items-center gap-2 text-sm">
                <label for={id} class="min-w-56">{t.answerLabel[field](theOf(s, t, answerThing), t.onPlace[answerPlace.id])}</label>
                <input id={id} type="text" inputMode="decimal" autoComplete="off" value={text} disabled={readOnly}
                  aria-invalid={invalid} aria-describedby={invalid ? `${id}-hint` : undefined}
                  class="w-28 rounded-md border border-slate-400 px-2 py-1 text-right tabular-nums focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300"
                  onInput={(e) => answer(field, (e.target as HTMLInputElement).value)} />
                <span>{unitOf(s, field)}</span>
                {invalid && <span id={`${id}-hint`} class="text-red-700">{t.notANumber}</span>}
              </div>
            );
          })}
        </fieldset>
      )}

      <div role="status" aria-live="polite" class="sr-only" data-testid="status">{announce}</div>
    </div>
  );
};

export default Interaction;
