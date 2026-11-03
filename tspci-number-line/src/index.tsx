import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems, Authored } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance, QtiRecordItem,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import { View } from "./board";
import {
  Answer, MAX_ITEMS, Settings, answerFrom, answerText, correctValue, emptyAnswer, evaluate, parseNumber, qtiValue, readSettings, touched,
} from "./numberline";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("tickstep"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

type Value = number[] | string;

/**
 * The values in a response, a correct response or a saved value: an ordered float list, a string (an interval, or
 * values separated by spaces), or the answer field of a record.
 */
const valueOf = (response: any): Value | null => {
  if (response === undefined || response === null) return null;
  if (typeof response === "string") return response.trim() ? response : null;
  if (typeof response === "number") return [response];
  if (Array.isArray(response?.record)) return valueOf(response.record.find((f: any) => f?.name === "answer")?.base?.string);
  const list = response?.list?.float ?? response?.list?.double ?? response?.list?.integer;
  if (Array.isArray(list)) return list.map(Number).filter(Number.isFinite);
  if (typeof response?.base?.string === "string") return valueOf(response.base.string);
  if (Array.isArray(response)) {
    // a correct response from a declaration: [2.75, -1.25], ["2.75", "-1.25"], or a record's values with field identifiers
    const field = response.find((v: any) => v?.fieldIdentifier === "answer" || v?.name === "answer");
    if (field) return valueOf(field.value ?? field.base?.string);
    if (response.length === 1 && typeof response[0] === "string" && /^[[(]/.test(response[0].trim())) return response[0];
    const numbers = response.map((v: any) => (typeof v === "number" ? v : parseNumber(v)));
    return numbers.length && numbers.every((n: number | null) => n !== null) ? (numbers as number[]) : null;
  }
  return null;
};

/** A saved answer, made to fit the task (as many points and read items as the task has). */
const ownAnswer = (s: Settings, raw: any): Answer => {
  const empty = emptyAnswer(s.task);
  const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const interval = raw?.interval && typeof raw.interval === "object" && num(raw.interval.from) !== null && num(raw.interval.to) !== null
    ? { from: raw.interval.from, to: raw.interval.to, fromEnd: raw.interval.fromEnd ?? "closed", toEnd: raw.interval.toEnd ?? "closed" }
    : null;
  return {
    points: empty.points.map((_, i) => num(raw?.points?.[i])),
    interval,
    start: num(raw?.start),
    landings: Array.isArray(raw?.landings) ? raw.landings.map(num).filter((v: number | null) => v !== null) : [],
    read: empty.read.map((_, i) => (typeof raw?.read?.[i] === "string" ? raw.read[i] : "")),
  };
};

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "numberLine";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  // The correct response the delivery engine handed us at getInstance time, or else the one from the settings.
  // See https://github.com/1EdTech/qti-project-management/issues/210
  private correct: Value | null = null;

  /** Only the module's own object registers; every interaction gets an object of its own (getInstance). */
  constructor(register = true) {
    if (register && ctx) {
      ctx.register(this);
    }
  }

  /** Every interaction on the page gets an object of its own, with its own store and settings. */
  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    const instance = new App(false);
    return instance.setup(dom, config, stateString);
  };

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.settings = readSettings(config.properties as unknown as Record<string, string>);
    this.correct = valueOf(config.responseDeclaration?.correctResponse?.value ?? config.responseDeclaration?.correctResponse) ??
      correctValue(this.settings.mode, this.settings.task);

    this.store = initStore({ answer: emptyAnswer(this.settings.task) });
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state?.answer) this.store.restoreState({ answer: ownAnswer(this.settings, saved.state.answer) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start with an empty line
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    this.render();
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && valueOf(response)) {
        this.setResponse(response);
      }
    }

    // The item is in solution status and there is a correct response (from the engine, or the settings):
    // show that on top of whatever was restored above.
    if (this.config.status === "solution" && this.correct) {
      this.showCorrectResponse();
    }

    // From here on, tell the Delivery System when the interaction changes (not for what it handed us above)
    this.store.subscribe(() => {
      const value = this.getResponse();
      const event: QtiInteractionChangedDetail = {
        interaction: this,
        responseIdentifier: this.config.responseIdentifier,
        valid: value !== undefined,
        value,
      };
      // dispatch a custom event to notify the Delivery System that the interaction has changed
      const interactionChangedEvent = new CustomEvent("qti-interaction-changed", {
        detail: event,
      });
      dom.dispatchEvent(interactionChangedEvent);
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /** Shows the correct response, read-only. A delivery engine calls this when it moves a running interaction into review. */
  showCorrectResponse = () => {
    if (!this.correct) return;
    const s = this.settings;
    this.store.restoreState({ answer: answerFrom(s.mode, s.task, this.correct, s.line, s.language) }, []);
  };

  private view = (s: Settings, readOnly: boolean, label: string): View => ({
    line: s.line, mode: s.mode, task: s.task, snap: s.snap, orientation: s.orientation, length: s.length, showValues: s.showValues,
    language: s.language, texts: textsFor(s.language), readOnly, label,
  });

  render = () => {
    const p = this.config.properties as unknown as Record<string, string>;
    this.settings = readSettings(p); // trigger() may have changed them
    const t = textsFor(this.settings.language);
    // the example's instruction, for the mode, in the candidate's language
    const prompt = p.prompt === (defaults as any).prompt && !String(p.task ?? "").trim() ? t.examplePrompt[this.settings.mode] : p.prompt;
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={prompt} store={this.store}
        view={this.view(this.settings, this.config.status === "solution", prompt ? `${t.line}: ${prompt}` : t.line)} />,
      this.shadowdom
    );
  };

  /**
   * Authoring mode: the author sets up the line (range, ticks, numbers, hidden numbers) and places the correct
   * points, interval or jumps, or the values to read off; getProperties() gives the line's settings and data-task.
   * Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) } as unknown as Record<string, string>;
    const settings = readSettings(properties);
    let authored: Authored = {
      raw: { min: properties.min, max: properties.max, tickStep: properties.tickStep, labelStep: properties.labelStep },
      format: settings.line.format,
      hidden: settings.line.hidden,
      task: settings.task,
    };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={authored} settings={settings} language={language} onChange={(next) => { authored = next; config.onchange?.(); }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({
        min: authored.raw.min.trim(),
        max: authored.raw.max.trim(),
        tickStep: authored.raw.tickStep.trim(),
        labelStep: authored.raw.labelStep.trim(),
        numberFormat: authored.format,
        hiddenLabels: authored.hidden.map(String).join("; "),
        task: JSON.stringify(authored.task),
      }),
      validate: () => authoringProblems(authored, settings, language),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  /** The correct response from the settings (AUTHORING.md, "The correct response from the settings"). */
  getCorrectResponse = (properties: Partial<PropTypes>): QtiVariableJSON | undefined => {
    const s = readSettings({ ...defaults, ...normalize(properties as Record<string, string>) } as unknown as Record<string, string>);
    const value = correctValue(s.mode, s.task);
    if (value === null) return undefined;
    return this.responseFor(s, answerFrom(s.mode, s.task, value, s.line, s.language));
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => {
      const before = this.settings.task;
      this.render();
      // other points or values to read off: the answer has to fit them
      if (this.settings.task !== before) this.store.restoreState({ answer: ownAnswer(this.settings, this.store.getState().answer) }, []);
    });
  };

  /** The response of an answer with the scoring of the settings. */
  private responseFor = (s: Settings, answer: Answer): QtiVariableJSON | undefined => {
    if (s.scoring === "pci") {
      const e = evaluate(s.mode, s.task, answer);
      const record: QtiRecordItem[] = [
        { name: "score", base: { integer: e.score } },
        { name: "maxscore", base: { integer: e.maxscore } },
        { name: "correct", base: { integer: e.correct ? 1 : 0 } },
      ];
      e.checks.slice(0, MAX_ITEMS).forEach((passed, i) => record.push({ name: `check${i + 1}`, base: { integer: passed ? 1 : 0 } }));
      record.push({ name: "answer", base: { string: answerText(s.mode, s.task, answer) } });
      return { record };
    }
    const value = qtiValue(s.mode, s.task, answer);
    if (value === null) return undefined;
    return (typeof value === "string" ? { base: { string: value } } : { list: { float: value } }) as QtiVariableJSON;
  };

  /**
   * data-scoring="qti" (default): an ordered float list (points, read, jumps), or a string (interval), once the answer
   * is complete. data-scoring="pci": a record with score, maxscore, correct, check1 … and answer, once anything is
   * done. Nothing before that.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const { answer } = this.store.getState();
    if (!touched(this.settings.mode, this.settings.task, answer)) return undefined;
    return this.responseFor(this.settings, answer);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  setResponse = (response: QtiVariableJSON) => {
    const value = valueOf(response);
    if (!value) return;
    const s = this.settings;
    this.store.restoreState({ answer: answerFrom(s.mode, s.task, value, s.line, s.language) }, []);
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions()
    });
}

export default new App();
