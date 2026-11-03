// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oatymart/html-template-interaction-pci, © 2024 Martin Nicholson and Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { IStore, useStore } from "@citolab/preact-store";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { Actions, StateModel } from "./store";
import { Field, MAX_LENGTH, Template, Value, countWords, kindOf } from "./template";
import { Texts } from "./texts";

// The author's (sanitised) HTML, as it is: the candidate fills in its own inputs. The original rendered it in a sandboxed
// iframe; here it lives in the PCI's shadow root, so its styles stay inside the interaction and its elements are part of
// the page for the keyboard and screen readers. The store holds what the candidate changed; this component keeps the
// elements and the store in line.

/** The response elements of one field in the rendered HTML (a radio group has several). */
const elementsOf = (container: HTMLElement, field: Field) =>
  [...container.querySelectorAll<HTMLInputElement>("[data-response][name]")].filter(
    (e) => e.getAttribute("name") === field.name && kindOf(e) === field.kind
  );

/** A field's value now: what the candidate gave it, or what the HTML gives it. */
export const valueOf = (field: Field, values: Record<string, Value>): Value =>
  Object.prototype.hasOwnProperty.call(values, field.name) ? values[field.name] : field.initial;

/** The value an element reports for its field, as the original did. */
const readElement = (element: HTMLInputElement, field: Field): Value | undefined => {
  switch (field.kind) {
    case "text": return element.value.substring(0, MAX_LENGTH) || null;
    case "select": return element.value || null;
    case "checkbox": return element.checked;
    case "radio": return element.checked ? element.value : undefined; // unchecking one radio is checking another
  }
};

const writeElements = (elements: HTMLInputElement[], field: Field, value: Value) => {
  const [first] = elements;
  if (!first) return;
  switch (field.kind) {
    case "text":
      if (first.value !== (value ?? "")) first.value = (value as string) ?? "";
      break;
    case "select": {
      const select = first as unknown as HTMLSelectElement;
      const options = [...select.options];
      const match = options.find((o) => o.value === (value ?? ""));
      select.selectedIndex = match ? options.indexOf(match) : -1;
      break;
    }
    case "checkbox":
      first.checked = value === true;
      break;
    case "radio":
      elements.forEach((r) => (r.checked = r.value === value));
      break;
  }
};

/** Author CSS written for a whole document: html and :root become the shadow host, body the content. */
const scopeSelectors = (rules: CSSRuleList) => {
  for (const rule of [...rules]) {
    if (rule instanceof CSSStyleRule) {
      const scoped = rule.selectorText
        .replace(/(^|[\s,>+~(])(html|:root)(?![\w-])/gi, "$1:host")
        .replace(/(^|[\s,>+~(])body(?![\w-])/gi, "$1.ht-body");
      if (scoped !== rule.selectorText) rule.selectorText = scoped;
    }
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested) scopeSelectors(nested);
  }
};

const Interaction = ({ template, prompt, store, texts, readOnly }: {
  template: Template;
  prompt: string;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
}) => {
  const { values } = useStore(store);
  const container = useRef<HTMLDivElement>(null);
  // the listeners are added once per template; they read the latest texts. Values always come from the store itself:
  // a render can lag behind the keystrokes, and writing its values back would undo the newest ones.
  const latest = useRef({ texts });
  latest.current = { texts };
  const current = () => store.getState().values;

  const updateWordcounts = () => {
    const root = container.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-wordcount-for]").forEach((target) => {
      const source = [...root.querySelectorAll<HTMLInputElement>("[name]")].find(
        (e) => e.getAttribute("name") === target.dataset.wordcountFor
      );
      if (source && kindOf(source) === "text") target.textContent = latest.current.texts.words(countWords(source.value));
    });
  };

  const sync = () => {
    const root = container.current;
    if (!root) return;
    template.fields.forEach((field) => writeElements(elementsOf(root, field), field, valueOf(field, current())));
    updateWordcounts();
  };

  // New HTML: make it fit the PCI, show the values, listen to the candidate
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    root.querySelectorAll("style").forEach((s) => s.sheet && scopeSelectors(s.sheet.cssRules));
    root.querySelectorAll<HTMLInputElement>("[data-response][name]").forEach((element) => {
      const kind = kindOf(element);
      if (kind === "text" && !element.hasAttribute("maxlength")) element.setAttribute("maxlength", String(MAX_LENGTH));
      if (readOnly) {
        if (kind === "text") element.readOnly = true;
        else if (kind) element.disabled = true;
      }
    });
    sync();

    const onChange = (event: Event) => {
      const element = event.target as HTMLInputElement;
      updateWordcounts();
      if (!element?.hasAttribute?.("data-response")) return;
      const field = template.fields.find((f) => f.name === element.getAttribute("name") && f.kind === kindOf(element));
      // only the first element of a name counts (and every radio of a group)
      if (!field || (field.kind !== "radio" && elementsOf(root, field)[0] !== element)) return;
      const value = readElement(element, field);
      if (value === undefined || value === valueOf(field, current())) return;
      store.dispatch({ type: "SET", payload: { name: field.name, value } });
    };
    // a form in the HTML never leaves the item
    const onSubmit = (event: Event) => event.preventDefault();
    root.addEventListener("input", onChange);
    root.addEventListener("change", onChange);
    root.addEventListener("submit", onSubmit);
    return () => {
      root.removeEventListener("input", onChange);
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
    };
  }, [template, readOnly]);

  // A response from outside (setResponse, reset, a restored state): show it
  useEffect(sync, [values, texts]);

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 text-[15px] text-slate-700">{prompt}</p>}
      <div ref={container} className="ht-body max-w-full overflow-x-auto p-1" role="group" aria-label={prompt || texts.interaction}
        data-testid="html" dangerouslySetInnerHTML={{ __html: template.markup }} />
    </div>
  );
};

export default Interaction;
