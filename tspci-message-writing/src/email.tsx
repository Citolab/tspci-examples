import { useState } from "preact/hooks";
import { Env } from "./context";
import { FileRef, Mail, parseAddresses } from "./message";
import { formatDate } from "./texts";
import { Aids, Avatar, Editor, FileIcon, Rich, btn, input, primary } from "./writing";

// The email client: the mailbox (inbox, the draft, sent), a message open, and the message the candidate writes.

const Attachment = ({ file, env }: { file: FileRef; env: Env }) => {
  const [open, setOpen] = useState(false);
  const { t } = env;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <FileIcon name={file.name} />
        <span className="font-medium text-slate-800">{file.name}</span>
        {file.size && <span className="text-slate-500">{file.size}</span>}
        {file.image && (
          <button type="button" className={`${btn} ml-auto px-2 py-0.5 text-[13px]`} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t.close(file.name) : t.open(file.name)}
          </button>
        )}
      </div>
      {file.image && open && <img src={file.image} alt={file.name} className="max-h-72 max-w-full self-start rounded-md border border-slate-200 bg-white object-contain" />}
    </li>
  );
};

const Address = ({ label, value }: { label: string; value?: string }) =>
  value ? (
    <div className="flex gap-2 text-[13px] text-slate-600">
      <dt className="w-16 shrink-0 font-medium">{label}</dt>
      <dd className="m-0 break-all">{value}</dd>
    </div>
  ) : null;

/** A received mail, opened. */
const Reader = ({ mail, env, onReply }: { mail: Mail; env: Env; onReply: (all: boolean) => void }) => {
  const { t, ui } = env;
  return (
    <article aria-labelledby="mail-subject" className="flex flex-col gap-3" data-testid="reader">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-3">
        <h3 id="mail-subject" lang={env.lang} className="m-0 text-lg font-semibold text-slate-900">{mail.subject || t.noSubject}</h3>
        <div className="flex items-start gap-3">
          <Avatar name={mail.from.name || mail.from.address} color="#0369a1" />
          <dl className="m-0 flex grow flex-col gap-0.5">
            <Address label={t.from} value={mail.from.name ? `${mail.from.name} <${mail.from.address}>` : mail.from.address} />
            <Address label={t.to} value={mail.to} />
            <Address label={t.cc} value={mail.cc} />
            <Address label={t.date} value={formatDate(mail.date, ui)} />
          </dl>
        </div>
      </header>
      <Rich text={mail.body} lang={env.lang} />
      {mail.attachments.length > 0 && (
        <section aria-labelledby="mail-attachments">
          <h4 id="mail-attachments" className="m-0 mb-1.5 text-[13px] font-semibold text-slate-600">{t.attachments} ({mail.attachments.length})</h4>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {mail.attachments.map((f) => <Attachment key={f.name} file={f} env={env} />)}
          </ul>
        </section>
      )}
      {!env.readOnly && (
        <div className="flex gap-2 border-t border-slate-200 pt-3">
          <button type="button" className={primary} onClick={() => onReply(false)}><span aria-hidden="true">↩</span> {t.reply}</button>
          {(mail.cc || (mail.to && mail.to.includes(","))) && (
            <button type="button" className={btn} onClick={() => onReply(true)}><span aria-hidden="true">↩↩</span> {t.replyAll}</button>
          )}
        </div>
      )}
    </article>
  );
};

/** The candidate's message, as it was sent (or as the model answer in review). */
const SentView = ({ env, onEdit }: { env: Env; onEdit?: () => void }) => {
  const { t, state, scenario, ui } = env;
  const m = state.email;
  return (
    <article aria-labelledby="sent-subject" className="flex flex-col gap-3" data-testid="sent">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-3">
        <h3 id="sent-subject" className="m-0 text-lg font-semibold text-slate-900">{m.subject || t.noSubject}</h3>
        <dl className="m-0 flex flex-col gap-0.5">
          <Address label={t.from} value={`${scenario.me.name} <${scenario.me.address}>`} />
          <Address label={t.to} value={m.to} />
          <Address label={t.cc} value={m.cc} />
          <Address label={t.date} value={m.sent ? formatDate(m.sent, ui) : t.notSent} />
        </dl>
      </header>
      <Rich text={m.body} lang={env.lang} />
      {m.attachments.length > 0 && (
        <section aria-labelledby="sent-attachments">
          <h4 id="sent-attachments" className="m-0 mb-1.5 text-[13px] font-semibold text-slate-600">{t.attachments} ({m.attachments.length})</h4>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {m.attachments.map((n) => <Attachment key={n} file={scenario.email.files.find((f) => f.name === n) ?? { name: n }} env={env} />)}
          </ul>
        </section>
      )}
      {onEdit && (
        <div className="flex items-center gap-3 border-t border-slate-200 pt-3">
          <span className="text-sm font-medium text-emerald-800"><span aria-hidden="true">✓ </span>{t.sentAt(formatDate(m.sent!, ui))}</span>
          <button type="button" className={btn} onClick={onEdit}>{t.edit}</button>
        </div>
      )}
    </article>
  );
};

/** The message the candidate writes: To, Cc, Subject, attachments, the text. */
const Composer = ({ env, onSend }: { env: Env; onSend: () => void }) => {
  const { t, state, scenario, store, readOnly, announce } = env;
  const m = state.email;
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<typeof m>) => store.dispatch({ type: "EMAIL", payload: { ...patch, seconds: env.elapsed() } });
  const replyTo = scenario.email.inbox.find((x) => x.id === m.replyTo);
  const toggle = (name: string, on: boolean) => {
    set({ attachments: on ? [...m.attachments.filter((n) => n !== name), name] : m.attachments.filter((n) => n !== name) });
    announce(on ? t.attached(name) : t.removed(name));
  };
  const field = (key: "to" | "cc" | "subject", label: string, hint?: string) => (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
      <label htmlFor={`mail-${key}`} className="text-[13px] font-medium text-slate-600">{label}</label>
      <input id={`mail-${key}`} type="text" value={m[key]} readOnly={readOnly} list={key !== "subject" ? "mail-contacts" : undefined}
        aria-describedby={hint ? "mail-addresses-hint" : undefined} autocomplete="off" spellcheck={key === "subject" ? env.spellcheck : false}
        lang={key === "subject" ? env.lang : undefined} className={input}
        onInput={(e) => set({ [key]: (e.target as HTMLInputElement).value })} />
    </div>
  );
  return (
    <form aria-labelledby="compose-title" className="flex flex-col gap-3" data-testid="composer"
      onSubmit={(e) => { e.preventDefault(); onSend(); }}>
      <h3 id="compose-title" className="m-0 text-lg font-semibold text-slate-900">{replyTo ? `${t.reply}: ${replyTo.subject}` : t.newMessage}</h3>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-[13px] text-slate-600">
          <span className="font-medium">{t.from}</span>
          <span>{scenario.me.name} &lt;{scenario.me.address}&gt;</span>
        </div>
        {field("to", t.to, t.addressesHint)}
        {field("cc", t.cc, t.addressesHint)}
        <p id="mail-addresses-hint" className="sr-only">{t.addressesHint}</p>
        <datalist id="mail-contacts">
          {[...scenario.contacts, ...scenario.email.inbox.map((x) => x.from)]
            .filter((c, i, all) => c.address && all.findIndex((o) => o.address === c.address) === i)
            .map((c) => <option key={c.address} value={c.address}>{c.name}</option>)}
        </datalist>
        {field("subject", t.subject)}
      </div>

      <section aria-labelledby="compose-attachments" className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h4 id="compose-attachments" className="m-0 text-[13px] font-semibold text-slate-600">{t.attachments}</h4>
          {!readOnly && scenario.email.files.length > 0 && (
            <button type="button" className={`${btn} px-2 py-0.5 text-[13px]`} aria-expanded={picking} aria-controls="attach-picker" onClick={() => setPicking(!picking)}>
              <span aria-hidden="true">📎</span> {t.attach}
            </button>
          )}
        </div>
        {m.attachments.length ? (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" data-testid="chosen">
            {m.attachments.map((n) => (
              <li key={n} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white py-0.5 pl-2.5 pr-1 text-[13px]">
                <FileIcon name={n} /> {n}
                {!readOnly && (
                  <button type="button" className="rounded-full px-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600"
                    aria-label={t.remove(n)} onClick={() => toggle(n, false)}>✕</button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-slate-500">{t.noAttachments}</p>
        )}
        {picking && !readOnly && (
          <fieldset id="attach-picker" className="m-0 flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <legend className="px-1 text-[13px] text-slate-600">{t.attachHint}</legend>
            {scenario.email.files.map((f) => (
              <label key={f.name} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-sky-700" checked={m.attachments.includes(f.name)}
                  onChange={(e) => toggle(f.name, (e.target as HTMLInputElement).checked)} />
                <FileIcon name={f.name} /> {f.name}
                {f.size && <span className="text-slate-500">{f.size}</span>}
              </label>
            ))}
            <button type="button" className={`${btn} mt-1 self-start`} onClick={() => setPicking(false)}>{t.done}</button>
          </fieldset>
        )}
      </section>

      <Editor id="mail-body" label={t.message} value={m.body} onChange={(body) => set({ body })} t={t} lang={env.lang} spellcheck={env.spellcheck}
        readOnly={readOnly} formatting rows={10} describedBy="mail-count" />
      <Aids text={m.body} limits={env.limits} t={t} id="mail-count" showCount={env.showCount} spell={env.spell} />

      {replyTo && (
        <details className="text-[13px] text-slate-600">
          <summary className="cursor-pointer">{t.wrote(formatDate(replyTo.date, env.ui), replyTo.from.name || replyTo.from.address)}</summary>
          <blockquote className="m-0 mt-2 border-l-4 border-slate-300 pl-3"><Rich text={replyTo.body} className="text-[13px]! text-slate-600" /></blockquote>
        </details>
      )}
      {!readOnly && (
        <div className="flex items-center gap-3">
          <button type="submit" className={primary}><span aria-hidden="true">➤</span> {t.send}</button>
        </div>
      )}
    </form>
  );
};

export const EmailClient = ({ env }: { env: Env }) => {
  const { t, state, scenario, store, readOnly, announce, ui } = env;
  const m = state.email;
  const inbox = scenario.email.inbox;
  const set = (patch: Partial<typeof m>, write = false) => store.dispatch({ type: "EMAIL", payload: write ? { ...patch, seconds: env.elapsed() } : patch });
  const unread = inbox.filter((x) => !m.read.includes(x.id)).length;
  const open = (id: string) => {
    set({ view: `mail:${id}`, read: m.read.includes(id) ? m.read : [...m.read, id] });
    const mail = inbox.find((x) => x.id === id);
    if (mail) announce(t.opened(mail.subject || t.noSubject));
  };
  const reply = (mail: Mail, all: boolean) => {
    const me = scenario.me.address.toLowerCase();
    const others = all ? parseAddresses(`${mail.to ?? ""},${mail.cc ?? ""}`).filter((a) => a !== me && a !== mail.from.address.toLowerCase()) : [];
    set({
      view: "compose",
      replyTo: mail.id,
      to: m.to.trim() ? m.to : mail.from.address,
      cc: m.cc.trim() || !others.length ? m.cc : others.join(", "),
      subject: m.subject.trim() ? m.subject : `${/^re:/i.test(mail.subject) ? "" : "Re: "}${mail.subject}`,
      sent: null,
    }, true);
    announce(t.replyingTo(mail.from.name || mail.from.address));
  };
  const send = () => {
    if (!parseAddresses(m.to, scenario.contacts).length) return announce(t.needRecipient);
    set({ sent: env.now(), view: "sent" }, true);
    announce(t.sent);
  };
  const written = !!(m.to || m.cc || m.subject || m.body || m.attachments.length || m.replyTo);
  const view = m.view;
  const current = view.startsWith("mail:") ? inbox.find((x) => `mail:${x.id}` === view) : null;
  const item = (active: boolean) =>
    `flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-sky-600 ${active ? "bg-sky-50 ring-1 ring-sky-300" : "hover:bg-slate-100"}`;
  return (
    <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-[15rem_1fr]" data-testid="email">
      <nav aria-label={t.mailbox} className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-3 sm:border-b-0 sm:border-r">
        {!readOnly && (
          <button type="button" className={`${primary} justify-center`} onClick={() => { set({ view: "compose", sent: null }); announce(t.composing); }}>
            <span aria-hidden="true">✎</span> {written && !m.sent ? t.drafts : t.newMessage}
          </button>
        )}
        <div>
          <h3 id="inbox-title" className="m-0 mb-1 flex items-baseline justify-between px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            {t.inbox} <span className="font-normal normal-case tracking-normal" data-testid="unread">{t.unreadCount(unread)}</span>
          </h3>
          {inbox.length ? (
            <ul aria-labelledby="inbox-title" className="m-0 flex list-none flex-col gap-1 p-0">
              {inbox.map((mail) => {
                const isUnread = !m.read.includes(mail.id);
                return (
                  <li key={mail.id}>
                    <button type="button" className={item(view === `mail:${mail.id}`)} aria-current={view === `mail:${mail.id}` ? "true" : undefined} onClick={() => open(mail.id)}>
                      <span className={`flex w-full items-center gap-1.5 text-sm ${isUnread ? "font-bold text-slate-900" : "text-slate-700"}`}>
                        {isUnread && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-sky-600" />}
                        <span className="truncate">{mail.from.name || mail.from.address}</span>
                        {mail.attachments.length > 0 && <span aria-hidden="true" className="ml-auto">📎</span>}
                      </span>
                      <span className={`w-full truncate text-[13px] ${isUnread ? "font-semibold text-slate-800" : "text-slate-600"}`}>{mail.subject || t.noSubject}</span>
                      <span className="text-[12px] text-slate-500">{formatDate(mail.date, ui)}</span>
                      {isUnread && <span className="sr-only">, {t.unread}</span>}
                      {mail.attachments.length > 0 && <span className="sr-only">, {t.attachments}: {mail.attachments.length}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 px-1 text-sm text-slate-500">{t.noMail}</p>
          )}
        </div>
        {(written || m.sent) && (
          <div>
            <h3 id="own-title" className="m-0 mb-1 px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-500">{m.sent ? t.sentFolder : t.drafts}</h3>
            <ul aria-labelledby="own-title" className="m-0 list-none p-0">
              <li>
                <button type="button" className={item(view === "compose" || view === "sent")} aria-current={view === "compose" || view === "sent" ? "true" : undefined}
                  onClick={() => set({ view: m.sent ? "sent" : "compose" })}>
                  <span className="text-sm text-slate-800">{m.to || "—"}</span>
                  <span className="w-full truncate text-[13px] text-slate-600">{m.subject || t.noSubject}</span>
                  <span className="text-[12px] text-slate-500">{m.sent ? formatDate(m.sent, ui) : t.notSent}</span>
                </button>
              </li>
            </ul>
          </div>
        )}
      </nav>
      <section aria-label={current ? current.subject || t.noSubject : view === "compose" ? t.newMessage : t.message} className="min-w-0 p-4">
        {current ? (
          <Reader mail={current} env={env} onReply={(all) => reply(current, all)} />
        ) : view === "compose" && !readOnly ? (
          <Composer env={env} onSend={send} />
        ) : view === "sent" || (readOnly && written) ? (
          <SentView env={env} onEdit={readOnly ? undefined : () => set({ sent: null, view: "compose" })} />
        ) : (
          <p className="m-0 text-sm text-slate-500">{t.chooseMail}</p>
        )}
      </section>
    </div>
  );
};
