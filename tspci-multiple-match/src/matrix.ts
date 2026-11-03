// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/multiplematch, © Jeppe Bundsgaard, Aarhus University (openPCI)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The settings of the original multiplematch PCI, read the way it reads them, and its response.
//
//   topics      one per line: "Topic", "name:Topic" or "name:Topic:Description" (column groups)
//   categories  one per line: "Category" or "value:Category"                    (the columns under every topic)
//   items       one per line: "Item" or "name:Item"                             (the rows)
//
// Every topic and item has a choice: one category (radio buttons) or, with `multiple`, several (checkboxes). The
// response is the JSON string the original gives: { "<topic name>_<item name>": "value" } or, with `multiple`,
// { "<topic name>_<item name>": ["value", …] }; a choice without an answer is "" or [].

export type Topic = { name: string; label: string; description: string };
export type Category = { value: string; label: string };
export type Item = { name: string; label: string };

/** Indices into the authored lists: the order a candidate sees. */
export type Order = { topics: number[]; categories: number[]; items: number[] };

/** The answers per choice key ("group1_item2"), always as a list; a radio choice holds at most one value. */
export type Answers = Record<string, string[]>;

export type Settings = {
  topics: Topic[];
  categories: Category[];
  items: Item[];
  multiple: boolean;
  topicSubset: number;
  reuseTopics: boolean;
  randomizeTopics: boolean;
  randomizeCategories: boolean;
  randomizeItems: boolean;
};

const lines = (text: string) =>
  String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

// The names the original makes when a line has no name of its own
export const parseTopic = (line: string): Topic => {
  const parts = line.split(":");
  if (parts.length < 2) return { name: line.toLowerCase().replace(/^[^a-z]+|\W/g, ""), label: line, description: "" };
  return { name: parts[0], label: parts[1], description: parts[2] ?? "" };
};

export const parseItem = (line: string): Item => {
  const parts = line.split(":");
  if (parts.length < 2) return { name: line.toLowerCase().replace(/\W/g, ""), label: line };
  return { name: parts[0], label: parts[1] };
};

export const parseCategory = (line: string): Category => {
  const parts = line.split(":");
  return { value: parts.length < 2 ? line : parts[0], label: parts[parts.length - 1] };
};

const bool = (value: unknown) => String(value).toLowerCase() === "true";

export const parseSettings = (p: Record<string, string>): Settings => {
  const subset = parseInt(p.topicsubset, 10);
  return {
    topics: lines(p.topics).map(parseTopic),
    categories: lines(p.categories).map(parseCategory),
    items: lines(p.items).map(parseItem),
    multiple: bool(p.multiple),
    topicSubset: Number.isFinite(subset) && subset > 0 ? subset : 0,
    reuseTopics: bool(p.reusetopics),
    randomizeTopics: bool(p.randomizetopics),
    randomizeCategories: bool(p.randomizecategories),
    randomizeItems: bool(p.randomizeitems),
  };
};

export const key = (topic: Topic, item: Item) => `${topic.name}_${item.name}`;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Fisher–Yates (the original sorted with a random comparator, which is biased). */
const shuffled = (list: number[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** A permutation of 0..n-1? */
const isOrderOf = (list: unknown, n: number): list is number[] =>
  Array.isArray(list) && list.length === n && range(n).every((i) => list.includes(i));

// The original keeps the order of the topics in a session cookie "topiclist": the first item writes it, a later item
// with `reusetopics` reads it, so the candidate sees the topics in the same (random) order and selection throughout.
const COOKIE = "topiclist";
const readTopicCookie = (): unknown => {
  try {
    const row = document.cookie.split("; ").find((r) => r.startsWith(`${COOKIE}=`));
    return row ? JSON.parse(decodeURIComponent(row.split("=")[1])) : undefined;
  } catch {
    return undefined;
  }
};
const writeTopicCookie = (order: number[]) => {
  try {
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(order))}; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // no cookies (sandboxed frame): every item orders its topics itself
  }
};

/**
 * The order the candidate sees. A saved order (state) wins, so a restored item looks the same; otherwise the
 * settings decide, as in the original.
 */
export const makeOrder = (s: Settings, saved?: Partial<Order> | null): Order => {
  let topics: number[];
  if (isOrderOf(saved?.topics, s.topics.length)) {
    topics = saved.topics;
  } else {
    const cookie = s.reuseTopics ? readTopicCookie() : undefined;
    if (isOrderOf(cookie, s.topics.length)) {
      topics = cookie;
    } else {
      topics = s.randomizeTopics ? shuffled(range(s.topics.length)) : range(s.topics.length);
      writeTopicCookie(topics);
    }
  }
  const pick = (savedList: unknown, n: number, random: boolean) =>
    isOrderOf(savedList, n) ? savedList : random ? shuffled(range(n)) : range(n);
  return {
    topics,
    categories: pick(saved?.categories, s.categories.length, s.randomizeCategories),
    items: pick(saved?.items, s.items.length, s.randomizeItems),
  };
};

/** What the candidate sees, in that order: the topic subset is taken after ordering, as in the original. */
export const visible = (s: Settings, order: Order) => {
  const topics = order.topics.map((i) => s.topics[i]);
  return {
    topics: s.topicSubset > 0 ? topics.slice(0, s.topicSubset) : topics,
    categories: order.categories.map((i) => s.categories[i]),
    items: order.items.map((i) => s.items[i]),
  };
};

/**
 * The response as the original gives it, but with the keys in the authored order (items, then topics) and the values
 * of a multiple choice in the authored order of the categories, whatever order the candidate saw: equal answers give
 * an equal string, so match_correct works. Only the topics shown are in it.
 */
export const responseObject = (s: Settings, order: Order, answers: Answers) => {
  const shown = new Set(visible(s, order).topics.map((t) => t.name));
  const result: Record<string, string | string[]> = {};
  for (const item of s.items) {
    for (const topic of s.topics) {
      if (!shown.has(topic.name)) continue;
      const chosen = answers[key(topic, item)] ?? [];
      const values = s.categories.map((c) => c.value).filter((v, i, all) => chosen.includes(v) && all.indexOf(v) === i);
      result[key(topic, item)] = s.multiple ? values : values[0] ?? "";
    }
  }
  return result;
};

export const hasAnswer = (answers: Answers) => Object.values(answers).some((v) => v.length > 0);

/** The response string (or the state the original saved) back to answers; values not in the categories are dropped. */
export const answersFrom = (s: Settings, value: unknown): Answers => {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const values = new Set(s.categories.map((c) => c.value));
  const answers: Answers = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const list = (Array.isArray(v) ? v : [v]).map(String).filter((x) => values.has(x));
    if (list.length) answers[k] = s.multiple ? list : list.slice(0, 1);
  }
  return answers;
};

/** Line breaks in a topic description: the original's tooltip asks for <br> or <p>. Rendered as text, never as HTML. */
export const descriptionLines = (text: string) =>
  text
    .split(/<br\s*\/?>|<\/?p\s*>/i)
    .map((l) => l.trim())
    .filter(Boolean);
