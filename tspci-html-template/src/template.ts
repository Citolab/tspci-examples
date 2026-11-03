// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oatymart/html-template-interaction-pci, © 2024 Martin Nicholson and Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The author's HTML (data-html): sanitised, and read for its response elements. Everything here works on an inert
// DOMParser document, so nothing in the author's HTML runs or loads while it is read.

/** Text values are cut off at this length (the original's limit). */
export const MAX_LENGTH = 10000;

export type BaseType = "string" | "identifier" | "boolean";
export type Value = string | boolean | null;
export type FieldKind = "text" | "select" | "checkbox" | "radio";

/** A field of the record response: one per name of a data-response element. */
export type Field = {
  name: string;
  kind: FieldKind;
  baseType: BaseType;
  /** The value the HTML itself gives: a value attribute, a checked box, a selected option. */
  initial: Value;
};

export type Problem =
  | { type: "removed"; what: string }
  | { type: "noName"; element: string }
  | { type: "unsupported"; element: string }
  | { type: "duplicate"; name: string }
  | { type: "noLabel"; name: string }
  | { type: "noResponse" };

export type Template = {
  /** The sanitised markup: the author's style elements, then the body. */
  markup: string;
  fields: Field[];
  problems: Problem[];
};

const TEXT_TYPES = ["text", "number", "email", "url", "search"];

/** Elements that run code, load other documents or change the page: removed with their content. */
const REMOVE = ["script", "iframe", "frame", "frameset", "object", "embed", "applet", "base", "meta", "link", "noscript", "portal", "title"];
/** Attributes that send something somewhere: removed. */
const DROP_ATTRIBUTES = ["action", "formaction", "ping", "srcdoc", "http-equiv"];
const URL_ATTRIBUTES = ["href", "xlink:href", "src", "srcset", "poster", "background", "data", "lowsrc", "dynsrc"];
const UNSAFE_URL = /^(javascript|vbscript|data:(?!image\/(png|gif|jpe?g|webp|avif|svg\+xml)[;,]))/i;

/** What kind of response element this is, or null when the PCI does not support it (as in the original). */
export const kindOf = (element: Element): FieldKind | null => {
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea") return "text";
  if (tag === "select") return element.hasAttribute("multiple") ? null : "select";
  if (tag !== "input") return null;
  const type = (element.getAttribute("type") ?? "text").toLowerCase();
  if (TEXT_TYPES.includes(type)) return "text";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  return null;
};

const BASE_TYPES: Record<FieldKind, BaseType> = { text: "string", select: "identifier", checkbox: "boolean", radio: "identifier" };

/** An option's value as the browser gives it: the value attribute, or the text. */
const optionValue = (option: Element) => option.getAttribute("value") ?? (option.textContent ?? "").replace(/\s+/g, " ").trim();

/** The text of an element for a message: its opening tag, short. */
const describe = (element: Element) => {
  const tag = element.outerHTML.match(/^<[^>]*>/)?.[0] ?? `<${element.tagName.toLowerCase()}>`;
  return tag.length > 80 ? `${tag.slice(0, 77)}…` : tag;
};

const initialValue = (element: Element, kind: FieldKind, doc: Document): Value => {
  const name = element.getAttribute("name");
  switch (kind) {
    case "text": {
      const value = element.tagName.toLowerCase() === "textarea" ? element.textContent ?? "" : element.getAttribute("value") ?? "";
      return value.substring(0, MAX_LENGTH) || null;
    }
    case "select": {
      const options = [...element.querySelectorAll("option")];
      // a single select shows its last selected option, or else the first one that is not disabled
      const chosen = options.filter((o) => o.hasAttribute("selected")).pop() ?? options.find((o) => !o.hasAttribute("disabled"));
      return chosen ? optionValue(chosen) || null : null;
    }
    case "checkbox":
      return element.hasAttribute("checked");
    case "radio": {
      const checked = [...doc.querySelectorAll("input[type=radio][data-response]")]
        .filter((r) => r.getAttribute("name") === name && r.hasAttribute("checked"))
        .pop();
      return checked ? checked.getAttribute("value") ?? "on" : null;
    }
  }
};

/** Has the element a name a screen reader can read? */
const hasLabel = (element: Element, doc: Document) => {
  if (element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby") || element.hasAttribute("title")) return true;
  if (element.closest("label")) return true;
  const id = element.getAttribute("id");
  return !!id && [...doc.querySelectorAll("label[for]")].some((l) => l.getAttribute("for") === id);
};

/** Takes out what could run code or leave the item; counts what it took out. */
const sanitize = (doc: Document, problems: Problem[]) => {
  const removed = new Set<string>();
  for (const tag of REMOVE) {
    doc.querySelectorAll(tag).forEach((e) => {
      removed.add(`<${tag}>`);
      e.remove();
    });
  }
  // SVG animation that sets a link could still sneak a javascript: URL in
  doc.querySelectorAll("set, animate").forEach((e) => {
    if (/href/i.test(e.getAttribute("attributeName") ?? "")) {
      removed.add(`<${e.tagName.toLowerCase()}>`);
      e.remove();
    }
  });
  doc.querySelectorAll("*").forEach((e) => {
    for (const attribute of [...e.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.replace(/[\u0000- ]/g, "");
      if (name.startsWith("on")) {
        removed.add("on… event handlers");
        e.removeAttribute(attribute.name);
      } else if (DROP_ATTRIBUTES.includes(name)) {
        removed.add(name);
        e.removeAttribute(attribute.name);
      } else if (URL_ATTRIBUTES.includes(name) && UNSAFE_URL.test(value)) {
        removed.add(`${name}="${value.split(":")[0]}:…"`);
        e.removeAttribute(attribute.name);
      }
    }
    // a link opens next to the test, never in its place
    if (e.tagName.toLowerCase() === "a" && e.hasAttribute("href") && !e.getAttribute("href").startsWith("#")) {
      e.setAttribute("target", "_blank");
      e.setAttribute("rel", "noopener noreferrer");
    }
  });
  // style sheets may not load others
  doc.querySelectorAll("style").forEach((s) => {
    const css = s.textContent ?? "";
    const stripped = css.replace(/@import[^;]*;?/gi, "");
    if (stripped !== css) removed.add("@import");
    s.textContent = stripped;
  });
  removed.forEach((what) => problems.push({ type: "removed", what }));
};

/** Reads and sanitises the author's HTML: a whole document or only some body content. */
export const prepare = (html: string): Template => {
  const problems: Problem[] = [];
  const doc = new DOMParser().parseFromString(html ?? "", "text/html");
  sanitize(doc, problems);

  const fields: Field[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll("[data-response]").forEach((element) => {
    const kind = kindOf(element);
    const name = element.getAttribute("name");
    if (!kind) {
      problems.push({ type: "unsupported", element: describe(element) });
      return;
    }
    if (!name) {
      problems.push({ type: "noName", element: describe(element) });
      return;
    }
    if (seen.has(name)) {
      // a radio group shares its name; anything else counts once (the first) and is reported
      const first = fields.find((f) => f.name === name);
      if (!(kind === "radio" && first?.kind === "radio")) problems.push({ type: "duplicate", name });
      return;
    }
    seen.add(name);
    if (!hasLabel(element, doc)) problems.push({ type: "noLabel", name });
    fields.push({ name, kind, baseType: BASE_TYPES[kind], initial: initialValue(element, kind, doc) });
  });
  if (!fields.length) problems.push({ type: "noResponse" });

  // every problem once
  const unique = problems.filter((p, i) => problems.findIndex((q) => JSON.stringify(q) === JSON.stringify(p)) === i);

  const headStyles = [...doc.head.querySelectorAll("style")].map((s) => s.outerHTML).join("\n");
  return { markup: `${headStyles}\n${doc.body.innerHTML}`, fields, problems: unique };
};

/** Problems that make the template unusable (the authoring mode's validate()); the others are warnings. */
export const isBlocking = (p: Problem) => p.type === "noResponse" || p.type === "duplicate" || p.type === "noName";

/** Count words as the original did: anything between separators. */
export const countWords = (text = "") => (text.match(/[^\s.,:;?!&#%/*+=]+/g) ?? []).length;

/** The example template: used when data-html is empty. */
export const DEFAULT_HTML = `<style>
  .sheet { display: grid; gap: 1.25rem; max-width: 40rem; }
  .sheet fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: .5rem; }
  .sheet legend, .sheet .q { font-weight: 600; margin-bottom: .25rem; }
  .sheet .row { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; }
  .sheet .count { color: #64748b; font-size: .875rem; margin: 0; }
</style>
<div class="sheet">
  <p>Complete the fact sheet about the Netherlands.</p>

  <div>
    <label class="q" for="capital">1. What is the capital of the Netherlands?</label><br>
    <input type="text" id="capital" name="capital" size="20" data-response>
  </div>

  <div>
    <label class="q" for="sea">2. Which sea lies along the coast?</label><br>
    <select id="sea" name="sea" data-response>
      <option value="">Choose…</option>
      <option value="north_sea">North Sea</option>
      <option value="baltic_sea">Baltic Sea</option>
      <option value="mediterranean">Mediterranean Sea</option>
    </select>
  </div>

  <fieldset>
    <legend>3. What is the official language?</legend>
    <div class="row">
      <label><input type="radio" name="official_language" value="dutch" data-response> Dutch</label>
      <label><input type="radio" name="official_language" value="german" data-response> German</label>
      <label><input type="radio" name="official_language" value="english" data-response> English</label>
    </div>
  </fieldset>

  <fieldset>
    <legend>4. Which countries share a border with the Netherlands?</legend>
    <div class="row">
      <label><input type="checkbox" name="border_be" data-response> Belgium</label>
      <label><input type="checkbox" name="border_de" data-response> Germany</label>
      <label><input type="checkbox" name="border_fr" data-response> France</label>
    </div>
  </fieldset>

  <div>
    <label class="q" for="dikes">5. Explain why much of the country is protected by dikes.</label>
    <textarea id="dikes" name="dikes" rows="4" data-response></textarea>
    <p class="count" data-wordcount-for="dikes"></p>
  </div>
</div>`;
