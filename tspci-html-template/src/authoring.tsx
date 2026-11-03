// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oatymart/html-template-interaction-pci, © 2024 Martin Nicholson and Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import Interaction, { valueOf } from "./interaction";
import { initStore } from "./store";
import style from "./style.css";
import { DEFAULT_HTML, Template, isBlocking, prepare } from "./template";
import { Texts, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the HTML next to a live preview, the response fields it gives
// and what is wrong with it. The result is data-html. The original had a single-line text property in TAO and a CLI
// script to inline images; here the author edits in the PCI and can insert an image as a data: URL.

/** What keeps the HTML from being used (getAuthoringInstance validate()). */
export const authoringProblems = (html: string, language: string) => {
  const t = textsFor(language);
  return prepare(html || DEFAULT_HTML).problems.filter(isBlocking).map(t.problem);
};

const button = "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600";

/** The preview in a shadow root of its own: the author's styles cannot reach the editor. */
const Preview = ({ template, texts }: { template: Template; texts: Texts }) => {
  const host = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const store = useMemo(() => initStore({ values: {} }), []);
  useEffect(() => {
    if (!mount.current) {
      const shadow = host.current.attachShadow({ mode: "open" });
      const css = document.createElement("style");
      css.textContent = style;
      mount.current = document.createElement("div");
      shadow.append(css, mount.current);
    }
    // After this render, not in it: Preact runs a pending effect when it renders the next update (the author typing
    // fast), and a render() inside that render breaks the editor's hooks
    queueMicrotask(() => {
      if (mount.current) render(<Interaction template={template} prompt="" store={store} texts={texts} readOnly={false} />, mount.current);
    });
  }, [template, texts]);
  useEffect(() => () => {
    const unmounted = mount.current;
    mount.current = null; // a queued preview is not rendered any more
    if (unmounted) render(null, unmounted);
  }, []);
  return <div ref={host} data-testid="preview" />;
};

const Authoring = ({ initial, language, onChange }: {
  initial: string;
  language: string;
  onChange: (html: string) => void;
}) => {
  const t = textsFor(language);
  const [html, setHtml] = useState(initial || DEFAULT_HTML);
  const editor = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const template = useMemo(() => prepare(html), [html]);
  const commit = (next: string) => {
    setHtml(next);
    onChange(next);
  };

  /** Puts a snippet where the cursor is, and selects it. */
  const insert = (snippet: string) => {
    const area = editor.current;
    const start = area?.selectionStart ?? html.length;
    const end = area?.selectionEnd ?? html.length;
    // a snippet starts on a line of its own
    if (start > 0 && html[start - 1] !== "\n") snippet = `\n${snippet}`;
    commit(html.slice(0, start) + snippet + html.slice(end));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start, start + snippet.length);
    });
  };
  /** A name that is not used yet: text1, text2… */
  const freeName = (prefix: string) => {
    const used = new Set(template.fields.map((f) => f.name));
    let n = 1;
    while (used.has(`${prefix}${n}`) || html.includes(`"${prefix}${n}"`)) n++;
    return `${prefix}${n}`;
  };
  const snippets: Record<keyof Omit<Texts["snippets"], "image">, () => string> = {
    text: () => {
      const n = freeName("text");
      return `<label for="${n}">${t.question}</label>\n<input type="text" id="${n}" name="${n}" data-response>\n`;
    },
    textarea: () => {
      const n = freeName("text");
      return `<label for="${n}">${t.question}</label>\n<textarea id="${n}" name="${n}" rows="4" data-response></textarea>\n<p data-wordcount-for="${n}"></p>\n`;
    },
    select: () => {
      const n = freeName("select");
      return `<label for="${n}">${t.question}</label>\n<select id="${n}" name="${n}" data-response>\n  <option value="">${t.choose}</option>\n  <option value="a">${t.option(1)}</option>\n  <option value="b">${t.option(2)}</option>\n</select>\n`;
    },
    radio: () => {
      const n = freeName("choice");
      return `<fieldset>\n  <legend>${t.question}</legend>\n  <label><input type="radio" name="${n}" value="a" data-response> ${t.option(1)}</label>\n  <label><input type="radio" name="${n}" value="b" data-response> ${t.option(2)}</label>\n</fieldset>\n`;
    },
    checkbox: () => {
      const n = freeName("check");
      return `<label><input type="checkbox" name="${n}" data-response> ${t.option(1)}</label>\n`;
    },
  };
  const insertImage = (input: HTMLInputElement) => {
    const chosen = input.files?.[0];
    if (!chosen) return;
    const reader = new FileReader();
    reader.onload = () => insert(`<img src="${reader.result}" alt="">\n`);
    reader.readAsDataURL(chosen);
    input.value = "";
  };

  const show = (v: ReturnType<typeof valueOf>) => (v === null ? "—" : JSON.stringify(v));

  return (
    <div className="grid gap-4 font-sans text-sm text-slate-800 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t.insert}>
          <span className="text-slate-600">{t.insert}:</span>
          {(Object.keys(snippets) as (keyof typeof snippets)[]).map((k) => (
            <button key={k} type="button" className={button} data-testid={`insert-${k}`} onClick={() => insert(snippets[k]())}>
              {t.snippets[k]}
            </button>
          ))}
          <button type="button" className={button} onClick={() => file.current?.click()}>{t.snippets.image}</button>
          <input ref={file} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
            onChange={(e) => insertImage(e.target as HTMLInputElement)} />
          <button type="button" className={`${button} ml-auto`} data-testid="example" onClick={() => commit(DEFAULT_HTML)}>{t.example}</button>
        </div>
        <label htmlFor="ht-editor" className="font-semibold">{t.html}</label>
        <textarea id="ht-editor" ref={editor} value={html} spellcheck={false} data-testid="editor" aria-describedby="ht-hint"
          className="h-[26rem] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600"
          onInput={(e) => commit((e.target as HTMLTextAreaElement).value)} />
        <p id="ht-hint" className="m-0 text-xs text-slate-500">{t.hint}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <h2 className="m-0 text-sm font-semibold">{t.preview}</h2>
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <Preview template={template} texts={t} />
        </div>

        <h2 className="m-0 text-sm font-semibold">{t.fields}</h2>
        {template.fields.length ? (
          <table className="w-full border-collapse text-left text-xs" data-testid="fields">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-1 pr-3 font-semibold">{t.field}</th>
                <th className="py-1 pr-3 font-semibold">{t.type}</th>
                <th className="py-1 font-semibold">{t.initial}</th>
              </tr>
            </thead>
            <tbody>
              {template.fields.map((f) => (
                <tr key={f.name} className="border-b border-slate-100">
                  <td className="py-1 pr-3 font-mono">{f.name}</td>
                  <td className="py-1 pr-3 font-mono">{f.baseType}</td>
                  <td className="py-1 font-mono">{show(f.initial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="m-0 text-slate-500">{t.noFields}</p>
        )}

        {template.problems.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="problems" aria-live="polite">
            {template.problems.map((p, i) => (
              <li key={i} className={`rounded-md px-2 py-1 text-xs ${isBlocking(p) ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                {t.problem(p)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Authoring;
