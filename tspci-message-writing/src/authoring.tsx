import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  Answer, CHECKS_FOR, CLOSINGS, Check, CheckType, ChatStep, Environment, ENVIRONMENTS, FileRef, GREETINGS, Limits, MAX_CHECKS, Mail, Person, Post,
  Scenario, WRITING_LANGUAGES, WritingLanguage, evaluate, isAddress, parseAddresses, parseScenario, serializeScenario,
} from "./message";
import { Texts, textsFor } from "./texts";
import { btn, input, primary } from "./writing";

// The authoring mode (index.tsx getAuthoringInstance): the environment, the task and limits, the content (inbox,
// chat script or thread), a model answer, the checks, a preview and the scenario as JSON.

export type Draft = { scenario: Scenario; environment: Environment; writingLanguage: WritingLanguage };

/** The model answer of the environment, as the checks read it (null without one). */
export const modelAnswer = (d: Draft): Answer | null => {
  const s = d.scenario;
  if (d.environment === "email") {
    const m = s.email.model;
    if (!m || !(m.body || m.subject || m.to)) return null;
    return { environment: "email", to: parseAddresses(m.to ?? "", s.contacts), cc: parseAddresses(m.cc ?? "", s.contacts), subject: (m.subject ?? "").trim(), attachments: m.attachments ?? [], text: m.body ?? "", replies: [m.body ?? ""] };
  }
  if (d.environment === "chat") {
    const replies = s.chat.model ?? [];
    return replies.length ? { environment: "chat", to: [], cc: [], subject: "", attachments: [], text: replies.join("\n\n"), replies } : null;
  }
  return s.post.model ? { environment: "post", to: [], cc: [], subject: "", attachments: [], text: s.post.model, replies: [s.post.model] } : null;
};

/** What keeps the scenario from being used (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (d: Draft, language: string, prompt = ""): string[] => {
  const t = textsFor(language);
  const s = d.scenario;
  const part = s[d.environment];
  const problems: string[] = [];
  if (!prompt.trim() && !part.task.trim()) problems.push(t.problemNoTask);
  if (part.limits.minWords && part.limits.maxWords && part.limits.minWords > part.limits.maxWords) problems.push(t.problemLimits);
  if (d.environment === "email" && s.email.start.startsWith("reply:") && !s.email.inbox.some((m) => `reply:${m.id}` === s.email.start)) problems.push(t.problemNoMail);
  if (d.environment === "chat") {
    if (!s.chat.steps.length) problems.push(t.problemNoSteps);
    for (const step of s.chat.steps) {
      if (!step.messages.length) problems.push(t.problemStepEmpty(step.id));
      for (const next of [step.next, ...step.branches.map((b) => b.next)]) {
        if (next && !s.chat.steps.some((x) => x.id === next)) problems.push(t.problemUnknownStep(step.id, next));
      }
    }
  }
  part.checks.forEach((c, i) => {
    const n = i + 1;
    if (c.type === "recipient" && !c.address) problems.push(t.problemNoAddress(n));
    if (c.type === "attachment" && !s.email.files.some((f) => f.name.toLowerCase() === (c.name ?? "").toLowerCase())) problems.push(t.problemNoFile(n, c.name ?? ""));
    if (c.type === "phrases" && !c.phrases?.length) problems.push(t.problemNoPhrases(n));
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) problems.push(t.problemRange(n));
  });
  const model = modelAnswer(d);
  if (model) evaluate(part.checks, model, part.limits, d.writingLanguage, s.contacts).results.forEach((r, i) => !r.passed && problems.push(t.problemModel(i + 1)));
  return [...new Set(problems)];
};

const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
const label = "flex flex-col gap-1 text-[13px] font-medium text-slate-600";
const card = "flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3";
type Tab = "task" | "content" | "model" | "checks" | "preview" | "json";

/** A text box for lines that are parsed into a list; it keeps what the author types and reports the parsed lines. */
const Lines = ({ value, onChange, rows = 3, testid, ...rest }: { value: string; onChange: (text: string) => void; rows?: number; testid?: string } & Omit<JSX.HTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) => {
  const [text, setText] = useState(value);
  return (
    <textarea {...rest} rows={rows} value={text} data-testid={testid} className={`${field} font-mono text-[13px]`}
      onInput={(e) => { const v = (e.target as HTMLTextAreaElement).value; setText(v); onChange(v); }} />
  );
};

const Text = ({ lbl, value, onChange, type = "text", testid, className = "" }: { lbl: string; value: string; onChange: (v: string) => void; type?: string; testid?: string; className?: string }) => (
  <label className={`${label} ${className}`}>
    {lbl}
    <input type={type} value={value} data-testid={testid} className={field} onInput={(e) => onChange((e.target as HTMLInputElement).value)} />
  </label>
);
const Area = ({ lbl, value, onChange, rows = 4, testid }: { lbl: string; value: string; onChange: (v: string) => void; rows?: number; testid?: string }) => (
  <label className={label}>
    {lbl}
    <textarea rows={rows} value={value} data-testid={testid} className={field} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
  </label>
);
const Num = ({ lbl, value, onChange, testid, placeholder }: { lbl: string; value: number | undefined; onChange: (v: number | undefined) => void; testid?: string; placeholder?: number }) => (
  <label className={label}>
    {lbl}
    <input type="number" min={0} value={value ?? ""} data-testid={testid} placeholder={placeholder === undefined ? undefined : String(placeholder)} className={`${field} w-28`}
      onInput={(e) => { const v = (e.target as HTMLInputElement).value; onChange(v === "" ? undefined : Math.max(0, Math.round(Number(v)))); }} />
  </label>
);

// line formats
const personLines = (ps: Person[]) => ps.map((p) => (p.name ? `${p.name} <${p.address}>` : p.address)).join("\n");
const readPeople = (text: string): Person[] =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)\s*<([^>]+)>\s*$/);
    return m ? { name: m[1].trim(), address: m[2].trim() } : { name: "", address: l };
  });
const fileLines = (fs: FileRef[], key: "size" | "image") => fs.map((f) => (f[key] ? `${f.name} | ${f[key]}` : f.name)).join("\n");
const readFiles = (text: string, key: "size" | "image"): FileRef[] =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, extra] = l.split("|").map((x) => x.trim());
    return extra ? { name, [key]: extra } : { name };
  });
const memberLines = (ms: { name: string; color?: string }[]) => ms.map((m) => (m.color ? `${m.name} | ${m.color}` : m.name)).join("\n");
const readMembers = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, color] = l.split("|").map((x) => x.trim());
    return color ? { name, color } : { name };
  });
const messageLines = (step: ChatStep) => step.messages.map((m) => `${m.from}: ${m.text}`).join("\n");
const readMessages = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? { from: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { from: "", text: l };
  });
const branchLines = (step: ChatStep) => step.branches.map((b) => `${b.keywords} -> ${b.next}`).join("\n");
const readBranches = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [keywords, next] = l.split("->").map((x) => (x ?? "").trim());
    return { keywords, next };
  }).filter((b) => b.keywords && b.next);
const listLines = (xs: string[] | undefined) => (xs ?? []).join("\n");
const readList = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

const Remove = ({ t, onClick, what }: { t: Texts; onClick: () => void; what: string }) => (
  <button type="button" className={`${btn} px-2 py-0.5 text-[13px]`} aria-label={`${t.removeItem}: ${what}`} onClick={onClick}>{t.removeItem}</button>
);

const newCheck = (type: CheckType, d: Draft): Check => {
  switch (type) {
    case "recipient": return { type, address: d.scenario.email.inbox[0]?.from.address ?? "", field: "to", points: 1 };
    case "attachment": return { type, name: d.scenario.email.files[0]?.name ?? "", points: 1 };
    case "phrases": return { type, phrases: [], points: 1 };
    case "replies": return { type, min: 2, points: 1 };
    default: return { type, points: 1 };
  }
};

const Authoring = ({ initial, language, prompt, onChange, preview }: {
  initial: Draft; language: string; prompt: string; onChange: (d: Draft) => void; preview?: (el: HTMLElement, d: Draft) => () => void;
}) => {
  const t = textsFor(language);
  const [draft, setDraft] = useState<Draft>(initial);
  const [tab, setTab] = useState<Tab>("task");
  const [version, setVersion] = useState(0); // the JSON tab replaces everything: text boxes start again
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState(false);
  const commit = (next: Draft) => { setDraft(next); onChange(next); };
  const s = draft.scenario;
  const env = draft.environment;
  const part = s[env];
  const setScenario = (patch: Partial<Scenario>) => commit({ ...draft, scenario: { ...s, ...patch } });
  const setPart = (patch: Record<string, unknown>) => setScenario({ [env]: { ...part, ...patch } } as Partial<Scenario>);
  const setEmail = (patch: Partial<Scenario["email"]>) => setScenario({ email: { ...s.email, ...patch } });
  const setChat = (patch: Partial<Scenario["chat"]>) => setScenario({ chat: { ...s.chat, ...patch } });
  const setPost = (patch: Partial<Scenario["post"]>) => setScenario({ post: { ...s.post, ...patch } });
  const problems = authoringProblems(draft, language, prompt);
  const model = modelAnswer(draft);
  const evaluation = model ? evaluate(part.checks, model, part.limits, draft.writingLanguage, s.contacts) : null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "task", label: t.tabTask }, { id: "content", label: t.tabContent }, { id: "model", label: t.tabModel },
    { id: "checks", label: t.tabChecks }, { id: "preview", label: t.tabPreview }, { id: "json", label: t.tabJson },
  ];
  const tabKeys = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((x) => x.id === tab);
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(tabs[to].id);
    (e.currentTarget.querySelectorAll("[role=tab]")[to] as HTMLElement)?.focus();
  };

  // --- the tabs

  const taskTab = (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
        <legend className="mb-1 text-[13px] font-semibold text-slate-700">{t.environment}</legend>
        {ENVIRONMENTS.map((e) => (
          <label key={e} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${env === e ? "border-sky-600 bg-sky-50" : "border-slate-300 bg-white"}`}>
            <input type="radio" name="environment" value={e} checked={env === e} className="accent-sky-700" onChange={() => commit({ ...draft, environment: e })} />
            <span aria-hidden="true">{e === "email" ? "✉️" : e === "chat" ? "💬" : "🗂"}</span> {t.env[e]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <Area lbl={t.task} value={part.task} onChange={(task) => setPart({ task })} rows={4} testid="task" />
        <p className="m-0 text-[12px] text-slate-500">{t.taskHint}</p>
      </div>
      <label className={label}>
        {t.writingLanguage}
        <select className={`${field} w-48`} value={draft.writingLanguage} data-testid="writing-language"
          onChange={(e) => commit({ ...draft, writingLanguage: (e.target as HTMLSelectElement).value as WritingLanguage })}>
          {WRITING_LANGUAGES.map((l) => <option key={l} value={l}>{{ en: "English", nl: "Nederlands", de: "Deutsch", fr: "Français" }[l]}</option>)}
        </select>
      </label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-[13px] font-semibold text-slate-700">{t.limits}</legend>
        <div className="flex flex-wrap gap-3">
          {(["minWords", "maxWords", "maxChars"] as (keyof Limits)[]).map((k) => (
            <Num key={k} lbl={t[k]} value={part.limits[k]} testid={k} onChange={(v) => {
              const limits = { ...part.limits };
              if (v) limits[k] = v; else delete limits[k];
              setPart({ limits });
            }} />
          ))}
        </div>
        <p className="m-0 text-[12px] text-slate-500">{t.limitsHint}</p>
      </fieldset>
    </div>
  );

  const mailCard = (m: Mail, i: number) => {
    const set = (patch: Partial<Mail>) => setEmail({ inbox: s.email.inbox.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    return (
      <fieldset key={`${version}-${m.id}`} className={`${card} m-0`}>
        <legend className="px-1 text-[13px] font-semibold text-slate-700">{m.subject || t.noSubject}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Text lbl={`${t.from}: ${t.name}`} value={m.from.name} onChange={(name) => set({ from: { ...m.from, name } })} />
          <Text lbl={`${t.from}: ${t.address}`} value={m.from.address} onChange={(address) => set({ from: { ...m.from, address } })} testid={`mail-${i}-from`} />
          <Text lbl={t.to} value={m.to ?? ""} onChange={(to) => set({ to })} />
          <Text lbl={t.cc} value={m.cc ?? ""} onChange={(cc) => set({ cc })} />
          <Text lbl={t.subject} value={m.subject} onChange={(subject) => set({ subject })} testid={`mail-${i}-subject`} />
          <Text lbl={t.dateTime} type="datetime-local" value={m.date.slice(0, 16)} onChange={(date) => set({ date })} />
        </div>
        <Area lbl={t.body} value={m.body} onChange={(body) => set({ body })} rows={6} testid={`mail-${i}-body`} />
        <label className={label}>
          {t.attachments}
          <Lines value={fileLines(m.attachments, "image")} onChange={(v) => set({ attachments: readFiles(v, "image") })} rows={2} aria-describedby="attachments-hint" />
        </label>
        <div className="flex gap-2">
          {i > 0 && <button type="button" className={`${btn} px-2 py-0.5 text-[13px]`} onClick={() => {
            const inbox = [...s.email.inbox];
            [inbox[i - 1], inbox[i]] = [inbox[i], inbox[i - 1]];
            setEmail({ inbox });
          }}>{t.moveUp}</button>}
          <Remove t={t} what={m.subject || t.noSubject} onClick={() => setEmail({ inbox: s.email.inbox.filter((_, j) => j !== i) })} />
        </div>
      </fieldset>
    );
  };

  const stepCard = (step: ChatStep, i: number) => {
    const set = (patch: Partial<ChatStep>) => setChat({ steps: s.chat.steps.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    return (
      <fieldset key={`${version}-${i}`} className={`${card} m-0`} data-testid={`step-${i}`}>
        <legend className="px-1 text-[13px] font-semibold text-slate-700">{t.step(step.id)}</legend>
        <Text lbl={t.stepId} value={step.id} onChange={(id) => set({ id: id.trim() || step.id })} className="w-48" />
        <label className={label}>{t.stepMessages}<Lines value={messageLines(step)} onChange={(v) => set({ messages: readMessages(v) })} rows={3} testid={`step-${i}-messages`} /></label>
        <label className={label}>{t.branches}<Lines value={branchLines(step)} onChange={(v) => set({ branches: readBranches(v) })} rows={2} testid={`step-${i}-branches`} /></label>
        <div className="flex flex-wrap items-end gap-3">
          <label className={label}>
            {t.next}
            <select className={field} value={step.next ?? ""} onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              const { next: _old, ...rest } = step;
              setChat({ steps: s.chat.steps.map((x, j) => (j === i ? (v ? { ...rest, next: v } : rest) : x)) });
            }}>
              <option value="">{t.nextNone}</option>
              {s.chat.steps.filter((x) => x.id !== step.id).map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-1 text-sm">
            <input type="checkbox" checked={!!step.end} className="accent-sky-700" onChange={(e) => set({ end: (e.target as HTMLInputElement).checked || undefined })} />
            {t.endChat}
          </label>
          <Remove t={t} what={t.step(step.id)} onClick={() => setChat({ steps: s.chat.steps.filter((_, j) => j !== i) })} />
        </div>
      </fieldset>
    );
  };

  const postCard = (p: Post, i: number) => {
    const set = (patch: Partial<Post>) => setPost({ posts: s.post.posts.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    return (
      <fieldset key={`${version}-${i}`} className={`${card} m-0`}>
        <legend className="px-1 text-[13px] font-semibold text-slate-700">{p.author || "…"}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Text lbl={t.author} value={p.author} onChange={(author) => set({ author })} />
          <Text lbl={t.handle} value={p.handle ?? ""} onChange={(handle) => set({ handle })} />
          <Text lbl={t.dateTime} type="datetime-local" value={(p.date ?? "").slice(0, 16)} onChange={(date) => set({ date })} />
        </div>
        <Area lbl={t.body} value={p.text} onChange={(text) => set({ text })} rows={3} testid={`post-${i}-text`} />
        <Text lbl={t.image} value={p.image ?? ""} onChange={(image) => set({ image })} />
        <div><Remove t={t} what={p.author || "…"} onClick={() => setPost({ posts: s.post.posts.filter((_, j) => j !== i) })} /></div>
      </fieldset>
    );
  };

  const contentTab = env === "email" ? (
    <div className="flex flex-col gap-4" key={version}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Text lbl={`${t.candidate}: ${t.name}`} value={s.me.name} onChange={(name) => setScenario({ me: { ...s.me, name } })} />
        <Text lbl={`${t.candidate}: ${t.address}`} value={s.me.address} onChange={(address) => setScenario({ me: { ...s.me, address } })} />
      </div>
      <label className={label}>{t.contacts} (Name &lt;address&gt;)<Lines value={personLines(s.contacts)} onChange={(v) => setScenario({ contacts: readPeople(v) })} testid="contacts" /></label>
      <label className={label}>
        {t.start}
        <select className={`${field} w-80`} value={s.email.start} data-testid="start" onChange={(e) => setEmail({ start: (e.target as HTMLSelectElement).value })}>
          <option value="inbox">{t.startInbox}</option>
          <option value="new">{t.startNew}</option>
          {s.email.inbox.map((m) => <option key={m.id} value={`reply:${m.id}`}>{t.startReply(m.subject || t.noSubject)}</option>)}
        </select>
      </label>
      <h3 className="m-0 text-sm font-semibold text-slate-800">{t.inboxMails}</h3>
      <p id="attachments-hint" className="m-0 text-[12px] text-slate-500">{t.attachmentsHint}</p>
      {s.email.inbox.map(mailCard)}
      <div>
        <button type="button" className={btn} onClick={() => {
          let n = s.email.inbox.length + 1;
          while (s.email.inbox.some((m) => m.id === `m${n}`)) n++;
          setEmail({ inbox: [...s.email.inbox, { id: `m${n}`, from: { name: "", address: "" }, subject: "", date: "", body: "", attachments: [] }] });
        }}>{t.addMail}</button>
      </div>
      <label className={label}>{t.files}<Lines value={fileLines(s.email.files, "size")} onChange={(v) => setEmail({ files: readFiles(v, "size") })} testid="files" aria-describedby="files-hint" /></label>
      <p id="files-hint" className="m-0 -mt-3 text-[12px] text-slate-500">{t.filesHint}</p>
    </div>
  ) : env === "chat" ? (
    <div className="flex flex-col gap-4" key={version}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Text lbl={t.chatTitle} value={s.chat.title} onChange={(title) => setChat({ title })} testid="chat-title" />
        <Text lbl={`${t.candidate}: ${t.name}`} value={s.me.name} onChange={(name) => setScenario({ me: { ...s.me, name } })} />
      </div>
      <label className={label}>{t.chatMembers}<Lines value={memberLines(s.chat.members)} onChange={(v) => setChat({ members: readMembers(v) })} rows={2} testid="members" /></label>
      <h3 className="m-0 text-sm font-semibold text-slate-800">{t.steps}</h3>
      <p className="m-0 text-[12px] text-slate-500">{t.stepsHint}</p>
      {s.chat.steps.map(stepCard)}
      <div>
        <button type="button" className={btn} onClick={() => {
          let n = s.chat.steps.length + 1;
          while (s.chat.steps.some((x) => x.id === `s${n}`)) n++;
          setChat({ steps: [...s.chat.steps, { id: `s${n}`, messages: [], branches: [] }] });
        }}>{t.addStep}</button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-4" key={version}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>
          {t.platform}
          <select className={field} value={s.post.platform} onChange={(e) => setPost({ platform: (e.target as HTMLSelectElement).value as "forum" | "social" })}>
            <option value="forum">{t.forum}</option>
            <option value="social">{t.social}</option>
          </select>
        </label>
        <Text lbl={t.threadTitle} value={s.post.title} onChange={(title) => setPost({ title })} />
        <Text lbl={`${t.candidate}: ${t.name}`} value={s.me.name} onChange={(name) => setScenario({ me: { ...s.me, name } })} />
      </div>
      <h3 className="m-0 text-sm font-semibold text-slate-800">{t.threadPosts}</h3>
      {s.post.posts.map(postCard)}
      <div><button type="button" className={btn} onClick={() => setPost({ posts: [...s.post.posts, { author: "", text: "" }] })}>{t.addPost}</button></div>
    </div>
  );

  const em = s.email.model ?? {};
  const modelTab = (
    <div className="flex flex-col gap-3" key={`${version}-${env}`}>
      <p className="m-0 text-[13px] text-slate-600">{t.modelHint}</p>
      {env === "email" ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Text lbl={t.to} value={em.to ?? ""} onChange={(to) => setEmail({ model: { ...em, to } })} testid="model-to" />
            <Text lbl={t.cc} value={em.cc ?? ""} onChange={(cc) => setEmail({ model: { ...em, cc } })} />
          </div>
          <Text lbl={t.subject} value={em.subject ?? ""} onChange={(subject) => setEmail({ model: { ...em, subject } })} testid="model-subject" />
          <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
            <legend className="mb-1 text-[13px] font-medium text-slate-600">{t.attachments}</legend>
            {s.email.files.map((f) => (
              <label key={f.name} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-sky-700" checked={(em.attachments ?? []).includes(f.name)}
                  onChange={(e) => setEmail({ model: { ...em, attachments: (e.target as HTMLInputElement).checked ? [...(em.attachments ?? []), f.name] : (em.attachments ?? []).filter((n) => n !== f.name) } })} />
                {f.name}
              </label>
            ))}
          </fieldset>
          <Area lbl={t.body} value={em.body ?? ""} onChange={(body) => setEmail({ model: { ...em, body } })} rows={10} testid="model-body" />
        </>
      ) : env === "chat" ? (
        <label className={label}>{t.modelReplies}<Lines value={listLines(s.chat.model)} onChange={(v) => setChat({ model: readList(v) })} rows={5} testid="model-replies" /></label>
      ) : (
        <Area lbl={t.yourReply} value={s.post.model ?? ""} onChange={(model) => setPost({ model })} rows={5} testid="model-post" />
      )}
    </div>
  );

  const checkCard = (c: Check, i: number) => {
    const set = (next: Check) => setPart({ checks: part.checks.map((x, j) => (j === i ? next : x)) });
    const result = evaluation?.results[i];
    const defaults = c.type === "greeting" ? GREETINGS[draft.writingLanguage] : CLOSINGS[draft.writingLanguage];
    return (
      <li key={`${version}-${i}-${c.type}`} className={card} data-testid={`check-${i}`}>
        <div className="flex flex-wrap items-end gap-3">
          <span className="pb-1 text-sm font-semibold text-slate-700">{i + 1}.</span>
          <label className={label}>
            {t.checkType}
            <select className={field} value={c.type} data-testid={`check-${i}-type`} onChange={(e) => set(newCheck((e.target as HTMLSelectElement).value as CheckType, draft))}>
              {CHECKS_FOR[env].map((type) => <option key={type} value={type}>{t.checkName[type]}</option>)}
            </select>
          </label>
          <Num lbl={t.points} value={c.points ?? 1} onChange={(points) => set({ ...c, points: points ?? 0 })} testid={`check-${i}-points`} />
          <span className={`ml-auto inline-flex items-center gap-1 pb-1 text-[13px] font-medium ${!result ? "text-slate-500" : result.passed ? "text-emerald-800" : "text-orange-800"}`} data-testid={`check-${i}-model`}>
            <span aria-hidden="true">{!result ? "–" : result.passed ? "✓" : "✗"}</span>
            {!result ? t.noModel : result.passed ? t.passesModel : t.failsModel}
          </span>
          <Remove t={t} what={`${i + 1}. ${t.checkName[c.type]}`} onClick={() => setPart({ checks: part.checks.filter((_, j) => j !== i) })} />
        </div>
        {c.type === "recipient" && (
          <div className="flex flex-wrap items-end gap-3">
            <Text lbl={t.address} value={c.address ?? ""} onChange={(address) => set({ ...c, address })} testid={`check-${i}-address`} className="w-72" />
            <label className={label}>
              {t.field}
              <select className={field} value={c.field ?? "to"} onChange={(e) => set({ ...c, field: (e.target as HTMLSelectElement).value as Check["field"] })}>
                <option value="to">{t.to}</option><option value="cc">{t.cc}</option><option value="any">{t.anyField}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pb-1 text-sm"><input type="checkbox" className="accent-sky-700" checked={!!c.exact} onChange={(e) => set({ ...c, exact: (e.target as HTMLInputElement).checked || undefined })} />{t.exact}</label>
            {c.address && !isAddress(parseAddresses(c.address, s.contacts)[0] ?? "") && <span className="pb-1 text-[13px] text-orange-800">▲ {t.address}?</span>}
          </div>
        )}
        {c.type === "attachment" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className={label}>
              {t.fileName}
              <select className={field} value={c.name ?? ""} data-testid={`check-${i}-file`} onChange={(e) => set({ ...c, name: (e.target as HTMLSelectElement).value })}>
                {!s.email.files.some((f) => f.name === c.name) && <option value={c.name ?? ""}>{c.name || "—"}</option>}
                {s.email.files.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-1 text-sm"><input type="checkbox" className="accent-sky-700" checked={!!c.exact} onChange={(e) => set({ ...c, exact: (e.target as HTMLInputElement).checked || undefined })} />{t.exact}</label>
          </div>
        )}
        {(c.type === "words" || c.type === "chars" || c.type === "replies") && (
          <div className="flex flex-wrap gap-3">
            <Num lbl={t.min} value={c.min} onChange={(min) => set({ ...c, min })} testid={`check-${i}-min`} placeholder={c.type === "words" ? part.limits.minWords : undefined} />
            {c.type !== "replies" && <Num lbl={t.max} value={c.max} onChange={(max) => set({ ...c, max })} testid={`check-${i}-max`} placeholder={c.type === "words" ? part.limits.maxWords : part.limits.maxChars} />}
          </div>
        )}
        {c.type === "phrases" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${label} grow`}>{t.phrases}<Lines value={listLines(c.phrases)} onChange={(v) => set({ ...c, phrases: readList(v) })} testid={`check-${i}-phrases`} /></label>
            <Num lbl={t.need} value={c.need} onChange={(need) => set({ ...c, need })} />
          </div>
        )}
        {c.type === "subject" && <label className={label}>{t.subjectWords}<Lines value={listLines(c.phrases)} onChange={(v) => set({ ...c, phrases: readList(v) })} rows={2} /></label>}
        {(c.type === "greeting" || c.type === "closing") && (
          <label className={label}>{t.options(defaults.slice(0, 4).join(", ") + ", …")}<Lines value={listLines(c.phrases)} onChange={(v) => set({ ...c, phrases: readList(v) })} rows={2} testid={`check-${i}-options`} /></label>
        )}
      </li>
    );
  };

  const checksTab = (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-slate-600">{t.checksHint}</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">{part.checks.map(checkCard)}</ol>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} disabled={part.checks.length >= MAX_CHECKS} onClick={() => setPart({ checks: [...part.checks, newCheck(CHECKS_FOR[env][0], draft)] })}>{t.addCheck}</button>
        {evaluation && <span className="text-sm font-medium text-slate-700" data-testid="summary">{t.summary(evaluation.score, evaluation.maxscore)}</span>}
      </div>
    </div>
  );

  const PreviewPane = () => {
    const el = useRef<HTMLDivElement>(null);
    useEffect(() => (el.current && preview ? preview(el.current, draft) : undefined), []);
    return <div ref={el} data-testid="preview-pane" />;
  };

  const jsonTab = (
    <div className="flex flex-col gap-2">
      <label className={label}>
        {t.json}
        <textarea rows={18} className={`${field} font-mono text-[12px]`} value={json} data-testid="json" aria-invalid={jsonError}
          onInput={(e) => { setJson((e.target as HTMLTextAreaElement).value); setJsonError(false); }} />
      </label>
      {jsonError && <p className="m-0 text-sm font-medium text-orange-800" role="alert">▲ {t.jsonError}</p>}
      <div>
        <button type="button" className={primary} onClick={() => {
          try {
            JSON.parse(json);
          } catch {
            return setJsonError(true);
          }
          commit({ ...draft, scenario: parseScenario(json) });
          setVersion(version + 1);
        }}>{t.apply}</button>
      </div>
    </div>
  );

  useEffect(() => { if (tab === "json") setJson(JSON.stringify(JSON.parse(serializeScenario(draft.scenario)), null, 2)); }, [tab]);

  return (
    <div className="flex flex-col gap-3 bg-slate-50 p-4 font-sans text-slate-800" lang={language}>
      <div role="tablist" aria-label="Scenario" className="flex flex-wrap gap-1 border-b border-slate-200" onKeyDown={tabKeys}>
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls="tab-panel" tabIndex={tab === x.id ? 0 : -1}
            className={`-mb-px rounded-t-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-600 ${tab === x.id ? "border-slate-200 border-b-slate-50 bg-slate-50 text-sky-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
            onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="tab-panel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-3">
        {tab === "task" ? taskTab : tab === "content" ? contentTab : tab === "model" ? modelTab : tab === "checks" ? checksTab : tab === "preview" ? <PreviewPane key={JSON.stringify(draft)} /> : jsonTab}
      </div>
      {problems.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900" aria-label={t.problems} data-testid="problems">
          {problems.map((p) => <li key={p}><span aria-hidden="true">▲ </span>{p}</li>)}
        </ul>
      )}
    </div>
  );
};

export default Authoring;
