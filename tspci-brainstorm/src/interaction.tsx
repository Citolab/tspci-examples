// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/brainstorm, © openPCI (Aarhus University and Aalborg
// University): Elias J.T. Hansen, Anna Rusmann & Jeppe Bundsgaard
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { IStore, useStore } from "@citolab/preact-store";
import { useEffect, useRef, useState } from "preact/hooks";
import { Session } from "./session";
import { Actions, StateModel } from "./store";
import { Entry } from "./script";
import { Texts } from "./texts";

// The chat is a role="log": a screen reader reads every new message (politely, once). The bots' "is typing" is shown
// but not announced. The time left is a progress bar; the end message is an alert.

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

const Avatar = ({ name, color }: { name: string; color?: string }) => (
  <span aria-hidden="true"
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm ring-2 ring-white"
    style={{ background: color || "var(--color-slate-500)" }}>
    {initials(name)}
  </span>
);

const Message = ({ entry, texts }: { entry: Entry; texts: Texts }) =>
  entry.player ? (
    <li className="flex justify-end gap-2 animate-[bs-in_.2s_ease-out]">
      <div className="flex max-w-[80%] flex-col items-end">
                <p className="m-0 whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-sky-600 px-3.5 py-2 text-[15px] leading-snug text-white shadow-sm">
          <span className="sr-only">{entry.name}: </span>
          {entry.text}
        </p>
        <span className="mt-0.5 text-[11px] tabular-nums text-slate-400" aria-hidden="true">{entry.time}</span>
      </div>
    </li>
  ) : (
    <li className="flex items-end gap-2 animate-[bs-in_.2s_ease-out]">
      <Avatar name={entry.name} color={entry.color} />
      <div className="flex max-w-[80%] flex-col items-start">
        <p className="m-0 whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2 text-[15px] leading-snug text-slate-800 shadow-sm">
          <span className="block text-xs font-semibold" style={{ color: entry.color || undefined }}>
            {entry.name}<span className="sr-only">: </span>
          </span>
          {entry.text}
        </p>
        <span className="mt-0.5 text-[11px] tabular-nums text-slate-400" aria-hidden="true">{entry.time}</span>
      </div>
    </li>
  );

const Interaction = ({ session, store, texts, nickname, startText, endText, readOnly }: {
  session: Session;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  nickname: string;
  startText: string;
  endText: string;
  readOnly: boolean;
}) => {
  const { phase, log } = useStore(store);
  const [, setTick] = useState(0);
  useEffect(() => { const off = session.subscribe(() => setTick((n) => n + 1)); return () => { off(); }; }, [session]);
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const typing = session.typing;

  // auto-scroll to the newest message (and the typing indicator)
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, typing.length]);

  useEffect(() => {
    if (phase === "running" && !readOnly) input.current?.focus({ preventScroll: true });
  }, [phase]);

  const disabled = readOnly || phase !== "running";
  const send = () => {
    session.say(draft);
    setDraft("");
  };
  const percent = Math.round(session.remaining * 100);
  const low = session.remaining < 0.2;

  return (
    <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 font-sans text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
      <style>{`@keyframes bs-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes bs-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`}</style>

      {/* header: title and time left */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">{texts.chat}</span>
        {!readOnly && (
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            <div role="progressbar" aria-label={texts.timeLeft} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
              aria-valuetext={texts.seconds(session.secondsLeft)}
              className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-slate-200">
              <div className={`h-full rounded-full transition-[width] duration-100 ease-linear ${low ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${percent}%` }} />
            </div>
            <span className="w-11 text-right text-xs tabular-nums text-slate-500" aria-hidden="true">
              {Math.floor(session.secondsLeft / 60)}:{String(session.secondsLeft % 60).padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      {/* messages */}
      <div ref={list} className={`h-80 overflow-y-auto px-3 py-4 transition-opacity ${phase === "ended" && !readOnly ? "opacity-60" : ""}`} tabIndex={0}
        aria-label={texts.chat} data-testid="chat">
        <ol role="log" aria-live="polite" aria-relevant="additions" className="m-0 flex list-none flex-col gap-3 p-0">
          {log.map((e, i) => <Message key={i} entry={e} texts={texts} />)}
        </ol>
        {log.length === 0 && phase !== "running" && readOnly && <p className="m-0 text-center text-sm text-slate-400">{texts.empty}</p>}
        {typing.length > 0 && (
          <div className="mt-3 flex items-end gap-2" aria-hidden="true" data-testid="typing">
            <Avatar name={typing[0].name} color={typing[0].color} />
            <div className="flex flex-col items-start">
              <span className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 rounded-full bg-slate-500" style={{ animation: `bs-dot 1.2s ${d * 0.15}s infinite` }} />
                ))}
              </span>
              <span className="mt-0.5 text-[11px] text-slate-400">{texts.typing(typing.map((b) => b.name))}</span>
            </div>
          </div>
        )}
      </div>

      {/* message box */}
      {!readOnly && (
        <form className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5"
          onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="brainstorm-message" className="sr-only">{texts.messageLabel} ({nickname})</label>
          <input id="brainstorm-message" ref={input} type="text" autoComplete="off" value={draft} disabled={disabled}
            placeholder={texts.placeholder} data-testid="message"
            className="min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-sky-600 focus:outline-2 focus:outline-offset-1 focus:outline-sky-600 disabled:cursor-not-allowed disabled:bg-slate-100"
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            // keys stay in the PCI (the delivery system may have shortcuts), and the bots wait while the candidate types
            onKeyDown={(e) => { e.stopPropagation(); session.keyPressed(); }} />
          <button type="submit" disabled={disabled || !draft.trim()} aria-label={texts.send}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
              <path d="M3.1 2.3a.75.75 0 0 0-1 .9l1.8 5.9a.75.75 0 0 0 .6.5l6.2 1-6.2 1a.75.75 0 0 0-.6.5l-1.8 5.9a.75.75 0 0 0 1 .9l15-7.3a.75.75 0 0 0 0-1.3z" />
            </svg>
          </button>
        </form>
      )}

      {/* start: the original's overlay ("click here when you are ready"), as a button */}
      {!readOnly && phase === "waiting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 p-6 backdrop-blur-[2px]">
          <button type="button" onClick={session.start} data-testid="start"
            className="max-w-sm rounded-2xl bg-white px-6 py-4 text-center text-lg font-semibold text-slate-800 shadow-lg ring-1 ring-slate-200 hover:ring-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
            {startText || texts.start}
          </button>
        </div>
      )}

      {/* end */}
      {!readOnly && phase === "ended" && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center p-6">
          <p role="alert" data-testid="ended" className="m-0 max-w-sm rounded-2xl bg-white px-6 py-4 text-center text-lg font-semibold text-slate-800 shadow-lg ring-1 ring-slate-200">
            {endText || texts.ended}
          </p>
        </div>
      )}
    </div>
  );
};

export default Interaction;
