import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Env } from "./context";
import { ChatEntry, clock, repliesOf, sendChat, stepById } from "./message";
import { Aids, Avatar, Editor, btn, primary } from "./writing";

// The chat app: the conversation (a log), the scripted messages arriving one by one, the candidate's text box, or
// at a choice step the reply buttons (quick replies).

export const ChatApp = ({ env }: { env: Env }) => {
  const { t, state, scenario, store, readOnly, announce } = env;
  const chat = scenario.chat;
  const c = state.chat;
  // the messages shown: the ones seen before at once, new ones after a pause each ("… is typing")
  const [shown, setShown] = useState(Math.min(env.seen, c.transcript.length));
  const list = useRef<HTMLDivElement>(null);
  const pending = c.transcript.length > shown ? c.transcript[shown] : null;
  // messages still to come: no reply yet
  const busy = !!pending;
  const typing = busy && pending.kind !== "system" && pending.from ? pending.from : null;
  const step = c.ended ? null : stepById(chat, c.waiting);
  const options = step?.options?.length ? step.options : null;

  useEffect(() => {
    if (shown > c.transcript.length) return setShown(c.transcript.length); // reset
    if (shown === c.transcript.length) return;
    // the candidate's own message and a notice at once (nobody types them); the replies after it one by one
    if (c.transcript[shown].me || c.transcript[shown].kind === "system") return setShown(shown + 1);
    if (env.chatDelay <= 0) {
      setShown(c.transcript.length);
      return;
    }
    const timer = setTimeout(() => setShown((n) => n + 1), env.chatDelay);
    return () => clearTimeout(timer);
  }, [shown, c.transcript.length]);

  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, busy]);

  const color = (name: string) => chat.members.find((m) => m.name === name)?.color;
  const form = useRef<HTMLFormElement>(null);
  const send = () => {
    if (!c.draft.trim() || busy || c.ended || options) return;
    const next = sendChat(chat, c, c.draft, env.now(), scenario.me.name);
    store.dispatch({ type: "CHAT", payload: { ...next, draft: "", seconds: env.elapsed() } });
    // a new, empty box (the key below), with the focus
    requestAnimationFrame(() => form.current?.querySelector("textarea")?.focus());
    announce(t.sentReply);
  };
  /** A reply button: the option goes into the chat as the candidate's message; the focus goes to the conversation. */
  const choose = (id: string, text: string) => {
    if (busy || c.ended) return;
    const next = sendChat(chat, c, id, env.now(), scenario.me.name);
    store.dispatch({ type: "CHAT", payload: { ...next, seconds: env.elapsed() } });
    requestAnimationFrame(() => list.current?.focus());
    announce(t.chose(text));
  };
  const nameStep = step?.ask === "name";
  const inputLabel = nameStep ? t.yourName : t.writeMessage;
  const members = [...chat.members.map((m) => m.name), t.you];

  return (
    <section aria-labelledby="chat-title" className="flex max-h-[42rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="chat">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="flex -space-x-2">
          {chat.members.slice(0, 3).map((m) => <Avatar key={m.name} name={m.name} color={m.color} size={8} />)}
        </span>
        <div className="min-w-0">
          <h3 id="chat-title" className="m-0 truncate text-base font-semibold text-slate-900">{chat.title || t.chat}</h3>
          <p className="m-0 truncate text-[13px] text-slate-500">{t.members(members)}</p>
        </div>
      </header>
      <div ref={list} role="log" aria-label={t.messages} tabIndex={0}
        className="flex min-h-64 grow flex-col overflow-y-auto bg-[linear-gradient(#f8fafc,#f1f5f9)] px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-600">
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {c.transcript.slice(0, shown).map((e, i) => {
            const prev: ChatEntry | undefined = c.transcript[i - 1];
            if (e.kind === "system") {
              return (
                <li key={i} className="self-center px-3 text-center text-[13px] italic text-slate-600" data-testid="chat-message" data-kind="system">
                  <span className="sr-only">{t.systemNotice}: </span>{e.text}
                </li>
              );
            }
            const first = !prev || prev.kind === "system" || prev.kind === "card" || prev.from !== e.from || !!prev.me !== !!e.me;
            const card = e.kind === "card";
            return (
              <li key={i} className={`flex items-end gap-2 ${card ? "max-w-[92%]" : "max-w-[85%]"} ${e.me ? "self-end flex-row-reverse" : "self-start"}`} data-testid="chat-message" data-me={e.me ? "true" : undefined} data-kind={e.kind}>
                {!e.me && (card && !e.from ? null : first || card ? <Avatar name={e.from} color={color(e.from)} size={7} /> : <span className="w-7 shrink-0" />)}
                {card ? (
                  <div className="flex min-w-48 flex-col gap-1 rounded-2xl rounded-bl-md border border-slate-300 bg-white px-3 py-2 shadow-xs" data-testid="chat-card">
                    {e.from && <span className="text-[12px] font-semibold" style={color(e.from) ? { color: color(e.from) } : undefined}>{e.from}<span className="sr-only">:</span></span>}
                    <div className="flex flex-col gap-1 rounded-lg border-l-4 border-sky-600 bg-slate-50 px-3 py-2">
                      <span lang={env.lang} className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900">
                        <span aria-hidden="true">📄</span><span className="sr-only">{t.document}: </span>{e.title}
                      </span>
                      <span lang={env.lang} className="whitespace-pre-wrap text-[14px] leading-snug text-slate-800">{e.text}</span>
                    </div>
                    <time dateTime={e.time} className="self-end text-[11px] text-slate-500">{clock(e.time)}</time>
                  </div>
                ) : (
                  <div className={`flex flex-col rounded-2xl px-3 py-1.5 shadow-xs ${e.me ? "rounded-br-md bg-sky-700 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}>
                    <span className={first ? "text-[12px] font-semibold" : "sr-only"} style={!e.me && color(e.from) ? { color: color(e.from) } : undefined}>
                      {e.me ? t.you : e.from}<span className="sr-only">:</span>
                    </span>
                    <span lang={env.lang} className="whitespace-pre-wrap text-[15px] leading-snug">{e.text}</span>
                    <time dateTime={e.time} className={`self-end text-[11px] ${e.me ? "text-sky-100" : "text-slate-500"}`}>{clock(e.time)}</time>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {c.ended && shown >= c.transcript.length && <p className="m-0 mt-3 self-center rounded-full bg-slate-200 px-3 py-0.5 text-[13px] text-slate-700">{t.chatEnded}</p>}
      </div>
      <p className="m-0 h-6 px-4 pt-1 text-[13px] italic text-slate-500" aria-live="polite" data-testid="typing">
        {typing ? (
          <>
            <span aria-hidden="true" className="mr-1 inline-flex gap-0.5 align-middle">
              {[0, 1, 2].map((d) => <span key={d} className="mw-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: `${d * 0.15}s` }} />)}
            </span>
            {t.typing(typing)}
          </>
        ) : ""}
      </p>
      {!readOnly && options && (
        <div className="flex flex-col gap-2 border-t border-slate-200 p-3" data-testid="quick-replies">
          {!busy && (
            <div role="group" aria-labelledby="quick-replies-label" className="flex flex-wrap justify-end gap-2">
              <span id="quick-replies-label" className="sr-only">{t.chooseReply}</span>
              {options.map((o) => (
                <button key={o.id} type="button" lang={env.lang} data-option={o.id} onClick={() => choose(o.id, o.text)}
                  className={`${btn} rounded-full border-sky-700 px-3.5 text-left text-[15px] text-sky-800 hover:bg-sky-50`}>
                  {o.text}
                </button>
              ))}
            </div>
          )}
          <p className="m-0 text-[12px] text-slate-500">{t.chooseReply}</p>
        </div>
      )}
      {!readOnly && !options && (
        <form ref={form} className="flex flex-col gap-2 border-t border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); send(); }} aria-label={t.writeMessage}>
          <div className="flex items-end gap-2">
            <div className="grow">
              <Editor key={c.transcript.filter((e) => e.me).length} id="chat-input" label={inputLabel} labelHidden value={c.draft} t={t} lang={env.lang} spellcheck={env.spellcheck && !nameStep} rows={nameStep ? 1 : 2}
                readOnly={c.ended} placeholder={c.ended ? t.chatEnded : inputLabel} describedBy="chat-hint chat-count"
                onChange={(draft) => store.dispatch({ type: "CHAT", payload: { draft, seconds: env.elapsed() } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }} />
            </div>
            <button type="submit" className={`${primary} mb-0.5`} disabled={busy || c.ended || !c.draft.trim()}><span aria-hidden="true">➤</span> {t.send}</button>
          </div>
          <p id="chat-hint" className="m-0 text-[12px] text-slate-500">{t.enterHint}</p>
          <Aids text={repliesOf(c.transcript).concat(nameStep ? [] : [c.draft]).join("\n\n")} limits={env.limits} t={t} id="chat-count" showCount={env.showCount} spell={env.spell} />
        </form>
      )}
    </section>
  );
};
