import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Env } from "./context";
import { clock, sendChat } from "./message";
import { Aids, Avatar, Editor, primary } from "./writing";

// The chat app: the conversation (a log), the scripted messages arriving one by one, the candidate's text box.

export const ChatApp = ({ env }: { env: Env }) => {
  const { t, state, scenario, store, readOnly, announce } = env;
  const chat = scenario.chat;
  const c = state.chat;
  // the messages shown: the ones seen before at once, new ones after a pause each ("… is typing")
  const [shown, setShown] = useState(Math.min(env.seen, c.transcript.length));
  const list = useRef<HTMLDivElement>(null);
  const pending = c.transcript.length > shown ? c.transcript[shown] : null;
  const typing = pending && !pending.me ? pending.from : null;

  useEffect(() => {
    if (shown > c.transcript.length) return setShown(c.transcript.length); // reset
    if (shown === c.transcript.length) return;
    if (c.transcript[shown].me || env.chatDelay <= 0) {
      setShown(c.transcript.length);
      return;
    }
    const timer = setTimeout(() => setShown((n) => n + 1), env.chatDelay);
    return () => clearTimeout(timer);
  }, [shown, c.transcript.length]);

  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, typing]);

  const color = (name: string) => chat.members.find((m) => m.name === name)?.color;
  const form = useRef<HTMLFormElement>(null);
  const send = () => {
    if (!c.draft.trim() || typing || c.ended) return;
    const next = sendChat(chat, c, c.draft, env.now(), scenario.me.name);
    store.dispatch({ type: "CHAT", payload: { ...next, draft: "", seconds: env.elapsed() } });
    // a new, empty box (the key below), with the focus
    requestAnimationFrame(() => form.current?.querySelector("textarea")?.focus());
    announce(t.sentReply);
  };
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
            const first = i === 0 || c.transcript[i - 1].from !== e.from || !!c.transcript[i - 1].me !== !!e.me;
            return (
              <li key={i} className={`flex max-w-[85%] items-end gap-2 ${e.me ? "self-end flex-row-reverse" : "self-start"}`} data-testid="chat-message" data-me={e.me ? "true" : undefined}>
                {!e.me && (first ? <Avatar name={e.from} color={color(e.from)} size={7} /> : <span className="w-7 shrink-0" />)}
                <div className={`flex flex-col rounded-2xl px-3 py-1.5 shadow-xs ${e.me ? "rounded-br-md bg-sky-700 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}>
                  <span className={first ? "text-[12px] font-semibold" : "sr-only"} style={!e.me && color(e.from) ? { color: color(e.from) } : undefined}>
                    {e.me ? t.you : e.from}<span className="sr-only">:</span>
                  </span>
                  <span lang={env.lang} className="whitespace-pre-wrap text-[15px] leading-snug">{e.text}</span>
                  <time dateTime={e.time} className={`self-end text-[11px] ${e.me ? "text-sky-100" : "text-slate-500"}`}>{clock(e.time)}</time>
                </div>
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
      {!readOnly && (
        <form ref={form} className="flex flex-col gap-2 border-t border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); send(); }} aria-label={t.writeMessage}>
          <div className="flex items-end gap-2">
            <div className="grow">
              <Editor key={c.transcript.filter((e) => e.me).length} id="chat-input" label={t.writeMessage} labelHidden value={c.draft} t={t} lang={env.lang} spellcheck={env.spellcheck} rows={2}
                readOnly={c.ended} placeholder={c.ended ? t.chatEnded : t.writeMessage} describedBy="chat-hint chat-count"
                onChange={(draft) => store.dispatch({ type: "CHAT", payload: { draft, seconds: env.elapsed() } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }} />
            </div>
            <button type="submit" className={`${primary} mb-0.5`} disabled={!!typing || c.ended || !c.draft.trim()}><span aria-hidden="true">➤</span> {t.send}</button>
          </div>
          <p id="chat-hint" className="m-0 text-[12px] text-slate-500">{t.enterHint}</p>
          <Aids text={c.transcript.filter((e) => e.me).map((e) => e.text).concat(c.draft).join("\n\n")} limits={env.limits} t={t} id="chat-count" showCount={env.showCount} spell={env.spell} />
        </form>
      )}
    </section>
  );
};
