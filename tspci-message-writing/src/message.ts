// The scenario (data-scenario), the candidate's answer, the checks and the response text, without imports, so node
// can test it (npm test). The UI is in interaction.tsx and its parts; index.tsx turns the answer into the response.

export type Environment = "email" | "chat" | "post";
export const ENVIRONMENTS: Environment[] = ["email", "chat", "post"];
export type WritingLanguage = "en" | "nl" | "de" | "fr";
export const WRITING_LANGUAGES: WritingLanguage[] = ["en", "nl", "de", "fr"];

export type Person = { name: string; address: string };
/** A file: in a received mail, or one the candidate can attach. `image` is a URL (or data: URL) for a preview. */
export type FileRef = { name: string; size?: string; image?: string };
export type Mail = {
  id: string;
  from: Person;
  to?: string;
  cc?: string;
  subject: string;
  /** "2026-10-12T09:14", shown in the candidate's language */
  date: string;
  body: string;
  attachments: FileRef[];
};
/** The writing aids' limits: shown to the candidate; a words or chars check without its own numbers uses them. */
export type Limits = { minWords?: number; maxWords?: number; maxChars?: number };
type Part = { task: string; limits: Limits; checks: Check[] };
export type EmailScenario = Part & {
  inbox: Mail[];
  /** the files the candidate can attach */
  files: FileRef[];
  /** "inbox" (the candidate starts in the inbox), "new" (a new message is open) or "reply:<id>" (a reply is open) */
  start: string;
  model?: { to?: string; cc?: string; subject?: string; body?: string; attachments?: string[] };
};
export type ChatLine = { from: string; text: string };
/** A branch: when the candidate's reply contains one of the keywords (`drink*|soda`), the chat goes on at `next`. */
export type Branch = { keywords: string; next: string };
/**
 * One step of the script: these messages arrive, then the chat waits for the candidate's reply, which picks the next
 * step: the first branch whose keywords the reply contains, else `next`. Without a next step, no more messages
 * arrive; `end` closes the chat after the messages (no reply).
 */
export type ChatStep = { id: string; messages: ChatLine[]; branches: Branch[]; next?: string; end?: boolean };
export type ChatMember = { name: string; color?: string };
export type ChatScenario = Part & { title: string; members: ChatMember[]; steps: ChatStep[]; model?: string[] };
export type Post = { author: string; handle?: string; date?: string; text: string; image?: string };
export type PostScenario = Part & { platform: "forum" | "social"; title: string; posts: Post[]; model?: string };

export type CheckType = "recipient" | "subject" | "attachment" | "words" | "chars" | "phrases" | "greeting" | "closing" | "replies";
export const CHECK_TYPES: CheckType[] = ["recipient", "subject", "attachment", "words", "chars", "phrases", "greeting", "closing", "replies"];
/** The checks that mean something in an environment. */
export const CHECKS_FOR: Record<Environment, CheckType[]> = {
  email: ["recipient", "subject", "attachment", "words", "chars", "phrases", "greeting", "closing"],
  chat: ["words", "chars", "phrases", "greeting", "closing", "replies"],
  post: ["words", "chars", "phrases", "greeting", "closing"],
};
export type Check = {
  type: CheckType;
  points?: number;
  /** recipient: an address (or a contact's name) */
  address?: string;
  /** recipient: "to" (default), "cc" or "any" */
  field?: "to" | "cc" | "any";
  /** recipient: no other addresses in that field; attachment: no other files */
  exact?: boolean;
  /** attachment: the file name */
  name?: string;
  /** words: the range (empty: data-min-words / data-max-words); chars: max (empty: data-max-chars); replies: min */
  min?: number;
  max?: number;
  /** phrases: `bike*|bicycle*`, one entry per phrase; subject: words it must contain; greeting/closing: the options */
  phrases?: string[];
  /** phrases: how many must be there (default all) */
  need?: number;
};
export const MAX_CHECKS = 8;

export type Scenario = { me: Person; contacts: Person[]; email: EmailScenario; chat: ChatScenario; post: PostScenario };

// --- the example ---------------------------------------------------------------------------------------------------

/** A small map as an SVG data URL: the example's image attachment, so the example needs no files. */
const MAP =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#ecfccb"/>` +
      `<path d="M0 150 C80 120 140 170 220 140 S320 120 320 120 V200 H0Z" fill="#7dd3fc"/>` +
      `<path d="M40 0 V200 M0 60 H320" stroke="#fef3c7" stroke-width="10"/>` +
      `<g fill="#166534"><circle cx="250" cy="40" r="14"/><circle cx="275" cy="55" r="12"/><circle cx="230" cy="70" r="10"/></g>` +
      `<rect x="80" y="80" width="60" height="36" rx="4" fill="#fff" stroke="#334155"/><text x="110" y="103" font-size="13" text-anchor="middle" font-family="sans-serif">Tents</text>` +
      `<rect x="170" y="20" width="44" height="30" rx="4" fill="#fff" stroke="#334155"/><text x="192" y="40" font-size="12" text-anchor="middle" font-family="sans-serif">Bikes</text>` +
      `<rect x="60" y="10" width="70" height="30" rx="4" fill="#fde68a" stroke="#334155"/><text x="95" y="30" font-size="12" text-anchor="middle" font-family="sans-serif">Reception</text></svg>`
  );

export const EXAMPLE: Scenario = {
  me: { name: "Sam Jansen", address: "sam.jansen@school.example" },
  contacts: [
    { name: "Lotte Bakker", address: "lotte@greenvalley.example" },
    { name: "Mr Visser", address: "visser@school.example" },
  ],
  email: {
    task:
      "Your class is going on a trip to Green Valley Campsite. Reply to Lotte's email: tell her how many students are coming (24) and when you arrive, and ask whether you can rent bikes. Send Mr Visser a copy (Cc) and add the list of dietary needs. Write 50 to 100 words.",
    inbox: [
      {
        id: "m1",
        from: { name: "Lotte Bakker", address: "lotte@greenvalley.example" },
        to: "sam.jansen@school.example",
        subject: "Your booking for the class trip",
        date: "2026-10-12T09:14",
        body:
          "Dear Sam,\n\nThank you for booking a group pitch at Green Valley Campsite. Before we can confirm your booking, I need some information:\n\n- How many students are coming?\n- On which day and at what time will you arrive?\n- Does anyone have special dietary needs?\n\nI have added a map of the campsite.\n\nKind regards,\nLotte Bakker\nGreen Valley Campsite",
        attachments: [{ name: "campsite-map.svg", size: "12 kB", image: MAP }],
      },
      {
        id: "m2",
        from: { name: "Mr Visser", address: "visser@school.example" },
        to: "class-3b@school.example",
        subject: "Class trip: what to bring",
        date: "2026-10-09T15:40",
        body: "Hi all,\n\nDon't forget: a sleeping bag, rain clothes, and good shoes. We leave on Monday 2 November at 8:30.\n\nMr Visser",
        attachments: [],
      },
    ],
    files: [
      { name: "dietary-needs.pdf", size: "48 kB" },
      { name: "class-photo.jpg", size: "1.2 MB" },
      { name: "maths-homework.docx", size: "22 kB" },
    ],
    start: "inbox",
    model: {
      to: "lotte@greenvalley.example",
      cc: "visser@school.example",
      subject: "Re: Your booking for the class trip",
      body:
        "Dear Lotte,\n\nThank you for your email. We are coming with **24 students** and two teachers. We will arrive on Monday 2 November at about 11 o'clock.\n\nI have added the list of dietary needs. Two students do not eat meat.\n\nCan we rent bikes at the campsite? We would like to cycle to the lake.\n\nKind regards,\nSam Jansen",
      attachments: ["dietary-needs.pdf"],
    },
    limits: { minWords: 50, maxWords: 100 },
    checks: [
      { type: "recipient", address: "lotte@greenvalley.example", field: "to", points: 1 },
      { type: "recipient", address: "visser@school.example", field: "cc", points: 1 },
      { type: "attachment", name: "dietary-needs.pdf", points: 1 },
      { type: "words", points: 1 },
      { type: "phrases", phrases: ["24|twenty-four", "bike*|bicycle*"], points: 1 },
      { type: "greeting", points: 1 },
      { type: "closing", points: 1 },
    ],

  },
  chat: {
    task: "Your class is planning a goodbye party for your teacher. Chat with Noor and Daan in the class chat: answer their questions and say what you will bring.",
    title: "Class 3B",
    members: [{ name: "Noor", color: "#7c3aed" }, { name: "Daan", color: "#0f766e" }],
    steps: [
      {
        id: "start",
        messages: [
          { from: "Noor", text: "Hi! Mr Visser leaves on Friday 😢 We want to have a party for him in the last lesson." },
          { from: "Daan", text: "Can you bring something? Drinks or snacks?" },
        ],
        branches: [
          { keywords: "drink*|lemonade|juice|cola|water", next: "drinks" },
          { keywords: "snack*|crisps|chips|cake|cookie*|biscuit*", next: "snacks" },
        ],
        next: "unclear",
      },
      { id: "drinks", messages: [{ from: "Noor", text: "Great, thanks! Then I'll bring the snacks. How many bottles can you bring?" }], branches: [], next: "card" },
      { id: "snacks", messages: [{ from: "Daan", text: "Nice! I'll bring drinks then. What kind of snacks are you bringing?" }], branches: [], next: "card" },
      {
        id: "unclear",
        messages: [{ from: "Daan", text: "Sorry, I don't get it 😅 Will you bring drinks or snacks?" }],
        branches: [
          { keywords: "drink*|lemonade|juice|cola|water", next: "drinks" },
          { keywords: "snack*|crisps|chips|cake|cookie*|biscuit*", next: "snacks" },
        ],
        next: "card",
      },
      { id: "card", messages: [{ from: "Noor", text: "One more thing: we're making a card. What do you want to write in it for Mr Visser?" }], branches: [] },
    ],
    limits: {},
    checks: [
      { type: "replies", min: 3, points: 1 },
      { type: "phrases", phrases: ["drink*|lemonade|juice|cola|water|snack*|crisps|chips|cake|cookie*|biscuit*"], points: 1 },
      { type: "phrases", phrases: ["thank*|miss"], points: 1 },
    ],
    model: ["Hi! Good idea. I can bring drinks, for example lemonade and water.", "I can bring four big bottles.", "Thank you for everything, Mr Visser! We will miss you."],
  },
  post: {
    task: "Someone on a forum for young readers asks for tips. Reply to the post: recommend a book you like and explain why. Use at most 400 characters.",
    platform: "forum",
    title: "Which book should I read next?",
    posts: [
      {
        author: "BookwormBo",
        handle: "@bookwormbo",
        date: "2026-10-20T19:02",
        text: "I just finished a really exciting book and now I don't know what to read next. I like adventure and stories about friendship. Any tips? Please say why you like the book!",
      },
      { author: "Mila_reads", handle: "@mila_reads", date: "2026-10-20T20:15", text: "Same question here, I'm curious what people recommend!" },
    ],
    limits: { maxChars: 400 },
    checks: [
      { type: "chars", min: 80, points: 1 },
      { type: "phrases", phrases: ["because|since|so|why"], points: 1 },
    ],
    model: "Hi Bo! You should read Holes by Louis Sachar. It is an adventure about a boy who has to dig holes in a desert camp. I like it because he makes a good friend there, and the end is really surprising. I read it in two days!",
  },
};

// --- reading the scenario ------------------------------------------------------------------------------------------

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | undefined => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const person = (v: any, fallback: Person): Person =>
  v && typeof v === "object" ? { name: str(v.name, fallback.name), address: str(v.address, fallback.address) } : typeof v === "string" ? { name: v, address: v } : fallback;
const file = (v: any): FileRef | null => {
  if (typeof v === "string" && v.trim()) return { name: v.trim() };
  if (!v || typeof v !== "object" || !str(v.name).trim()) return null;
  const f: FileRef = { name: str(v.name).trim() };
  if (str(v.size)) f.size = str(v.size);
  if (str(v.image)) f.image = str(v.image);
  return f;
};

const readCheck = (v: any): Check | null => {
  if (!v || !CHECK_TYPES.includes(v.type)) return null;
  const c: Check = { type: v.type, points: Math.max(0, Math.round(num(v.points) ?? 1)) };
  if (str(v.address)) c.address = str(v.address).trim();
  if (["to", "cc", "any"].includes(v.field)) c.field = v.field;
  if (v.exact === true) c.exact = true;
  if (str(v.name)) c.name = str(v.name).trim();
  if (num(v.min) !== undefined) c.min = num(v.min);
  if (num(v.max) !== undefined) c.max = num(v.max);
  const phrases = arr(v.phrases).map((p) => str(p).trim()).filter(Boolean);
  if (phrases.length) c.phrases = phrases;
  if (num(v.need) !== undefined) c.need = num(v.need);
  return c;
};

/**
 * data-scenario as JSON; what is missing comes from the example (an empty setting: the whole example). Each part may
 * be left out: `{ "email": { … } }` keeps the example's chat and post.
 */
const readLimits = (v: any): Limits => {
  const l: Limits = {};
  for (const k of ["minWords", "maxWords", "maxChars"] as const) {
    const n = num(v?.[k]);
    if (n !== undefined && n > 0) l[k] = Math.round(n);
  }
  return l;
};
const readChecks = (v: any): Check[] => arr(v).map(readCheck).filter(Boolean).slice(0, MAX_CHECKS);

export const parseScenario = (text: string | undefined | null): Scenario => {
  let raw: any = null;
  if (text && text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null; // not JSON: the example
    }
  }
  const own = !!raw && typeof raw === "object";
  if (!own) raw = {};
  const ex = EXAMPLE;
  const me = person(raw.me, ex.me);
  const contacts = raw.contacts ? arr(raw.contacts).map((c) => person(c, { name: "", address: "" })).filter((c) => c.address) : ex.contacts;

  const e = raw.email && typeof raw.email === "object" ? raw.email : null;
  const email: EmailScenario = e
    ? {
        task: str(e.task),
        limits: readLimits(e.limits),
        checks: readChecks(e.checks),
        inbox: arr(e.inbox).map((m, i) => ({
          id: str(m?.id, `m${i + 1}`) || `m${i + 1}`,
          from: person(m?.from, { name: "", address: "" }),
          to: str(m?.to) || undefined,
          cc: str(m?.cc) || undefined,
          subject: str(m?.subject),
          date: str(m?.date),
          body: str(m?.body),
          attachments: arr(m?.attachments).map(file).filter(Boolean),
        })),
        files: arr(e.files).map(file).filter(Boolean),
        start: str(e.start, "inbox") || "inbox",
        model: e.model && typeof e.model === "object"
          ? { to: str(e.model.to), cc: str(e.model.cc), subject: str(e.model.subject), body: str(e.model.body), attachments: arr(e.model.attachments).map((a) => str(a)).filter(Boolean) }
          : undefined,
      }
    : ex.email;

  const c = raw.chat && typeof raw.chat === "object" ? raw.chat : null;
  const chat: ChatScenario = c
    ? {
        task: str(c.task),
        limits: readLimits(c.limits),
        checks: readChecks(c.checks),
        title: str(c.title),
        members: arr(c.members).map((m) => (typeof m === "string" ? { name: m } : { name: str(m?.name), ...(str(m?.color) ? { color: str(m.color) } : {}) })).filter((m) => m.name),
        steps: arr(c.steps).map((s, i) => {
          const step: ChatStep = {
            id: str(s?.id, `s${i + 1}`) || `s${i + 1}`,
            messages: arr(s?.messages).map((l) => ({ from: str(l?.from), text: str(l?.text) })).filter((l) => l.text),
            branches: arr(s?.branches).map((b) => ({ keywords: str(b?.keywords), next: str(b?.next) })).filter((b) => b.keywords && b.next),
          };
          if (str(s?.next)) step.next = str(s.next);
          if (s?.end === true) step.end = true;
          return step;
        }),
        model: c.model ? arr(c.model).map((m) => str(m)).filter(Boolean) : undefined,
      }
    : ex.chat;

  const p = raw.post && typeof raw.post === "object" ? raw.post : null;
  const post: PostScenario = p
    ? {
        task: str(p.task),
        limits: readLimits(p.limits),
        checks: readChecks(p.checks),
        platform: p.platform === "social" ? "social" : "forum",
        title: str(p.title),
        posts: arr(p.posts)
          .map((x) => {
            const post: Post = { author: str(x?.author), text: str(x?.text) };
            for (const k of ["handle", "date", "image"] as const) if (str(x?.[k])) post[k] = str(x[k]);
            return post;
          })
          .filter((x) => x.text),
        model: str(p.model) || undefined,
      }
    : ex.post;
  return { me, contacts, email, chat, post };
};

/** The scenario as data-scenario, without empty optional fields. */
export const serializeScenario = (s: Scenario) =>
  JSON.stringify(s, (key, value) => (value === undefined || (key === "model" && value && Object.values(value).every((v) => !v || (Array.isArray(v) && !v.length))) ? undefined : value));

// --- text ----------------------------------------------------------------------------------------------------------

/** The text without the formatting marks: `**bold**` and `*italic*` lose their stars, `- ` list marks stay out. */
export const plainText = (text: string) =>
  (text ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s+/, ""))
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(\S(?:.*?\S)?)\*/g, "$1");

/** Words: runs of letters and digits, with ' and - inside a word ("don't", "twenty-four" count once). */
export const countWords = (text: string) => (plainText(text).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length;

/** Characters as a person counts them (an emoji is one), without the formatting marks. */
export const countChars = (text: string) => Array.from(plainText(text)).length;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(\S(?:.*?\S)?)\*/g, "<em>$1</em>");

/** The text with its formatting as HTML: paragraphs, `<strong>`, `<em>` and `<ul>` lists; everything else escaped. */
export const toHtml = (text: string) => {
  const blocks: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(`<p>${para.map(inline).join("<br>")}</p>`);
    if (list.length) blocks.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`);
    para = [];
    list = [];
  };
  for (const line of (text ?? "").split("\n")) {
    const item = line.match(/^\s*[-*•]\s+(.*)$/);
    if (item) {
      if (para.length) flush();
      list.push(item[1]);
    } else if (!line.trim()) flush();
    else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks.join("");
};

/** Parts of the text for the UI: the same marks as toHtml, as data, so preact renders them without innerHTML. */
export type Run = { text: string; bold?: boolean; italic?: boolean };
export type Block = { type: "p"; lines: Run[][] } | { type: "ul"; items: Run[][] };
export const runs = (line: string): Run[] => {
  const out: Run[] = [];
  const re = /\*\*(.+?)\*\*|\*(\S(?:.*?\S)?)\*/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], italic: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
};
export const blocks = (text: string): Block[] => {
  const out: Block[] = [];
  let cur: Block | null = null;
  for (const line of (text ?? "").split("\n")) {
    const item = line.match(/^\s*[-*•]\s+(.*)$/);
    if (item) {
      if (cur?.type !== "ul") out.push((cur = { type: "ul", items: [] }));
      (cur as any).items.push(runs(item[1]));
    } else if (!line.trim()) cur = null;
    else {
      if (cur?.type !== "p") out.push((cur = { type: "p", lines: [] }));
      (cur as any).lines.push(runs(line));
    }
  }
  return out;
};

/** A formatting button: wraps the selection in marks (or puts a list mark before each selected line). */
export const format = (text: string, start: number, end: number, kind: "bold" | "italic" | "list"): { text: string; start: number; end: number } => {
  if (kind === "list") {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const nl = text.indexOf("\n", end > start && text[end - 1] === "\n" ? end - 1 : end);
    const lineEnd = nl === -1 ? text.length : nl;
    const lines = text.slice(lineStart, lineEnd).split("\n");
    const all = lines.every((l) => /^\s*-\s/.test(l));
    const next = lines.map((l) => (all ? l.replace(/^\s*-\s/, "") : `- ${l}`)).join("\n");
    return { text: text.slice(0, lineStart) + next + text.slice(lineEnd), start: lineStart, end: lineStart + next.length };
  }
  const mark = kind === "bold" ? "**" : "*";
  const selected = text.slice(start, end);
  // already marked: take the marks away
  if (text.slice(start - mark.length, start) === mark && text.slice(end, end + mark.length) === mark && (kind === "bold" || text.slice(start - 2, start) !== "**")) {
    return { text: text.slice(0, start - mark.length) + selected + text.slice(end + mark.length), start: start - mark.length, end: end - mark.length };
  }
  return { text: text.slice(0, start) + mark + selected + mark + text.slice(end), start: start + mark.length, end: end + mark.length };
};

// --- addresses -----------------------------------------------------------------------------------------------------

/**
 * A To or Cc field as addresses: separated by commas, semicolons or spaces; `Name <address>` gives the address, a
 * contact's name gives its address. Lower case, without doubles.
 */
export const parseAddresses = (field: string, contacts: Person[] = []): string[] => {
  const out: string[] = [];
  const add = (a: string) => {
    const v = a.trim().toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  };
  for (const part of (field ?? "").split(/[,;]/)) {
    const angle = part.match(/<([^>]+)>/);
    if (angle) {
      add(angle[1]);
      continue;
    }
    const trimmed = part.trim();
    if (!trimmed) continue;
    const contact = contacts.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (contact) {
      add(contact.address);
      continue;
    }
    for (const word of trimmed.split(/\s+/)) add(word);
  }
  return out;
};
export const isAddress = (a: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(a);

// --- phrases -------------------------------------------------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** One alternative as a regular expression: `*` is any letters, the ends are word boundaries (any script). */
const phraseRe = (alt: string) => {
  const body = alt
    .trim()
    .split(/\s+/)
    .map((w) => w.split("*").map(escapeRe).join("[\\p{L}\\p{N}'’\\-]*"))
    .join("[\\s\\p{P}]+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu");
};
/** Whether the text contains the phrase: `bike*|bicycle*` is one of these, case-insensitive, whole words. */
export const hasPhrase = (text: string, phrase: string) =>
  phrase
    .split("|")
    .map((a) => a.trim())
    .filter(Boolean)
    .some((alt) => phraseRe(alt).test(plainText(text)));

/** Whether the text starts with the phrase (after spaces and punctuation), as a whole word. */
const startsWithPhrase = (line: string, phrase: string) =>
  phrase
    .split("|")
    .map((a) => a.trim())
    .filter(Boolean)
    .some((alt) => new RegExp(`^[\\s\\p{P}]*${phraseRe(alt).source.replace("(?<![\\p{L}\\p{N}])", "")}`, "iu").test(line));

export const GREETINGS: Record<WritingLanguage, string[]> = {
  en: ["Dear", "Hello", "Hi", "Hey", "Good morning", "Good afternoon", "Good evening"],
  nl: ["Beste", "Geachte", "Hallo", "Hoi", "Hey", "Hai", "Dag", "Goedemorgen", "Goedemiddag", "Goedenavond", "Lieve"],
  de: ["Sehr geehrte", "Sehr geehrter", "Liebe", "Lieber", "Hallo", "Hi", "Guten Tag", "Guten Morgen", "Moin", "Servus"],
  fr: ["Madame", "Monsieur", "Bonjour", "Bonsoir", "Cher", "Chère", "Salut", "Coucou"],
};
export const CLOSINGS: Record<WritingLanguage, string[]> = {
  en: ["Kind regards", "Best regards", "Regards", "Best wishes", "Yours sincerely", "Yours faithfully", "Love", "Thanks", "Thank you", "See you", "Cheers", "Bye"],
  nl: ["Met vriendelijke groet", "Vriendelijke groet", "Met vriendelijke groeten", "Groeten", "Groetjes", "Hartelijke groet", "Liefs", "Doei", "Tot ziens", "Tot later", "Bedankt", "Alvast bedankt", "Dank je wel", "Dank u wel"],
  de: ["Mit freundlichen Grüßen", "Mit freundlichem Gruß", "Freundliche Grüße", "Viele Grüße", "Liebe Grüße", "Herzliche Grüße", "Beste Grüße", "Grüße", "Tschüss", "Bis bald", "Danke", "Vielen Dank"],
  fr: ["Cordialement", "Bien cordialement", "Bien à vous", "Je vous prie d'agréer", "Amicalement", "Amitiés", "Bisous", "Bises", "À bientôt", "Merci", "Salut"],
};

const lines = (text: string) => plainText(text).split("\n").map((l) => l.trim()).filter(Boolean);

// --- the answer and the checks -------------------------------------------------------------------------------------

/** What the candidate wrote, in one shape for every environment; the checks read only this. */
export type Answer = {
  environment: Environment;
  to: string[];
  cc: string[];
  subject: string;
  attachments: string[];
  /** the body, the post, or the chat replies one after another (a blank line between) */
  text: string;
  /** the chat replies (one, the text, in the other environments) */
  replies: string[];
};

export type CheckResult = { check: Check; passed: boolean; points: number };
export type Evaluation = { results: CheckResult[]; score: number; maxscore: number; correct: boolean };

/** Whether one check passes for this answer. */
export const passes = (check: Check, a: Answer, limits: Limits, language: WritingLanguage = "en", contacts: Person[] = []): boolean => {
  switch (check.type) {
    case "recipient": {
      if (!check.address) return false;
      const want = parseAddresses(check.address, contacts)[0];
      const fields = check.field === "cc" ? [a.cc] : check.field === "any" ? [a.to, a.cc] : [a.to];
      return fields.some((f) => f.includes(want) && (!check.exact || f.length === 1));
    }
    case "subject": {
      const subject = a.subject.replace(/^\s*((re|aw|antw|fw|fwd|wg|tr)\s*:\s*)+/i, "").trim();
      if (!subject) return false;
      return (check.phrases ?? []).every((p) => hasPhrase(subject, p));
    }
    case "attachment": {
      if (!check.name) return false;
      const has = a.attachments.some((n) => n.toLowerCase() === check.name!.toLowerCase());
      return has && (!check.exact || a.attachments.length === 1);
    }
    case "words": {
      const n = countWords(a.text);
      const min = check.min ?? limits.minWords;
      const max = check.max ?? limits.maxWords;
      return n > 0 && (min === undefined || n >= min) && (max === undefined || n <= max);
    }
    case "chars": {
      const n = countChars(a.text);
      const max = check.max ?? limits.maxChars;
      return n > 0 && (max === undefined || n <= max) && (check.min === undefined || n >= check.min);
    }
    case "phrases": {
      const phrases = check.phrases ?? [];
      if (!phrases.length) return false;
      const found = phrases.filter((p) => hasPhrase(a.text, p)).length;
      return found >= Math.min(phrases.length, check.need ?? phrases.length);
    }
    case "greeting": {
      const options = check.phrases?.length ? check.phrases : GREETINGS[language] ?? GREETINGS.en;
      const first = lines(a.replies[0] ?? "")[0] ?? "";
      return options.some((o) => startsWithPhrase(first, o));
    }
    case "closing": {
      const options = check.phrases?.length ? check.phrases : CLOSINGS[language] ?? CLOSINGS.en;
      const last = a.replies[a.replies.length - 1] ?? "";
      const tail = a.environment === "chat" ? [plainText(last)] : lines(last).slice(-3);
      return tail.some((l) => options.some((o) => (a.environment === "chat" ? hasPhrase(l, o) : startsWithPhrase(l, o))));
    }
    case "replies":
      return a.replies.filter((r) => r.trim()).length >= (check.min ?? 1);
  }
  return false;
};

/** The checks of the environment, for this answer. */
export const evaluate = (checks: Check[], a: Answer, limits: Limits, language: WritingLanguage = "en", contacts: Person[] = []): Evaluation => {
  const results = checks.slice(0, MAX_CHECKS).map((check) => {
    const passed = CHECKS_FOR[a.environment].includes(check.type) && passes(check, a, limits, language, contacts);
    return { check, passed, points: passed ? check.points ?? 1 : 0 };
  });
  const score = results.reduce((s, r) => s + r.points, 0);
  const maxscore = results.reduce((s, r) => s + (r.check.points ?? 1), 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed) };
};

// --- chat ----------------------------------------------------------------------------------------------------------

export type ChatEntry = { from: string; text: string; time: string; me?: boolean };
export const stepById = (chat: ChatScenario, id: string | null | undefined) => chat.steps.find((s) => s.id === id) ?? null;

/** The step after the candidate's reply to this step: the first branch whose keywords the reply has, else next. */
export const nextStep = (chat: ChatScenario, current: string | null, reply: string): ChatStep | null => {
  const step = stepById(chat, current);
  if (!step) return null;
  const branch = step.branches.find((b) => hasPhrase(reply, b.keywords));
  return stepById(chat, branch?.next ?? step.next);
};

export type ChatState = { transcript: ChatEntry[]; waiting: string | null; ended: boolean };

/** The chat as it starts: the first step's messages, waiting for the candidate (or ended). */
export const startChat = (chat: ChatScenario, time: string): ChatState => {
  const first = chat.steps[0];
  if (!first) return { transcript: [], waiting: null, ended: false };
  return { transcript: first.messages.map((m) => ({ ...m, time })), waiting: first.end ? null : first.id, ended: !!first.end };
};

/** The candidate sends a reply: it goes into the chat, and the next step's messages follow. */
export const sendChat = (chat: ChatScenario, state: ChatState, text: string, time: string, name: string): ChatState => {
  if (state.ended || !text.trim()) return state;
  const transcript = [...state.transcript, { from: name, text: text.trim(), time, me: true }];
  const next = state.waiting ? nextStep(chat, state.waiting, text) : null;
  if (!next) return { transcript, waiting: null, ended: false };
  return { transcript: [...transcript, ...next.messages.map((m) => ({ ...m, time }))], waiting: next.end ? null : next.id, ended: !!next.end };
};

/** The candidate's replies from a chat. */
export const repliesOf = (transcript: ChatEntry[]) => transcript.filter((e) => e.me).map((e) => e.text);

/** A chat from a list of replies (setResponse with only text, the model answer): the script answers each. */
export const replay = (chat: ChatScenario, replies: string[], time: string, name: string): ChatState =>
  replies.reduce((s, r) => sendChat(chat, s, r, time, name), startChat(chat, time));

// --- the message for a rater ---------------------------------------------------------------------------------------

/** "09:14" from an ISO time, as it was written (no time zones: the scenario's dates are local). */
export const clock = (iso: string) => (iso.match(/T(\d{2}:\d{2})/) ?? [])[1] ?? "";

/** Labels of the plain-text message, in the item's language (en, nl). */
export type MessageLabels = { to: string; cc: string; subject: string; attachments: string; me: string; draft: string; notSent: string };

/** The whole message as a rater reads it: the header lines, a blank line, the text; a chat as `[time] name: text`. */
export const messageText = (a: Answer, l: MessageLabels, extra: { transcript?: ChatEntry[]; draft?: string; sent?: boolean } = {}) => {
  if (a.environment === "chat") {
    const out = (extra.transcript ?? []).map((e) => `[${clock(e.time)}] ${e.me ? l.me : e.from}: ${e.text}`);
    if (extra.draft?.trim()) out.push(`(${l.draft}) ${extra.draft.trim()}`);
    return out.join("\n");
  }
  const head: string[] = [];
  if (a.environment === "email") {
    head.push(`${l.to}: ${a.to.join(", ")}`);
    if (a.cc.length) head.push(`${l.cc}: ${a.cc.join(", ")}`);
    head.push(`${l.subject}: ${a.subject}`);
    if (a.attachments.length) head.push(`${l.attachments}: ${a.attachments.join(", ")}`);
  }
  if (!extra.sent) head.push(`(${l.notSent})`);
  return `${head.join("\n")}${head.length ? "\n\n" : ""}${a.text}`;
};
