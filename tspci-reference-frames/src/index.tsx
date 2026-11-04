// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Trainpci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Relatempci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, QtiRecordItem } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore, validState } from "./store";
import { Settings, answersText, keyAnswers, parseAnswers, parseSettings, parseViewed, scoreOf, viewedText } from "./settings";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("startframe"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

/** The value of a field of a record response ({ record: [{ name, base }] }). */
const field = (response: any, name: string): unknown => {
  const item = Array.isArray(response?.record) ? response.record.find((f: any) => f?.name === name) : undefined;
  const base = item?.base ?? {};
  return base.string ?? base.integer ?? base.identifier;
};

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "referenceFrames";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  settings: Settings;

  /** Only the module's own object registers; every interaction gets an object of its own (getInstance). */
  constructor(register = true) {
    if (register && ctx) {
      ctx.register(this);
    }
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App =>
    new App(false).setup(dom, config, stateString);

  private initial = (): StateModel => ({
    frame: this.settings.startFrame,
    traced: this.settings.traced,
    time: 0,
    rate: this.settings.rate,
    seen: [],
    answers: {},
  });

  private setup = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string): App => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.settings = parseSettings(this.config.properties as Record<string, unknown>);

    this.store = initStore(this.initial());
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        const state = validState(saved?.state, this.initial());
        if (state) this.store.restoreState({ ...state, answers: parseAnswers(this.settings, answersText(this.settings, state.answers)) }, saved.log ?? []);
      } catch {
        // not a state of this PCI: start at the settings
      }
    }

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });

    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0 && !stateString) {
      const response = this.config.boundTo[Object.keys(this.config.boundTo)[0]];
      if (response && Array.isArray((response as any).record)) this.setResponse(response);
    }
    // solution: the author's key in the answers
    if (this.config.status === "solution") this.showCorrectResponse();
    this.render();

    // From here on, tell the Delivery System when the interaction changes (not for what it handed us above)
    this.store.subscribe(() => {
      const event: QtiInteractionChangedDetail = {
        interaction: this,
        responseIdentifier: this.config.responseIdentifier,
        valid: true,
        value: this.getResponse(),
      };
      dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { detail: event }));
    }, { immediate: false });

    this.config.onready && this.config.onready(this);
    return this;
  };

  /** The key of the questions as the answers (status solution). */
  showCorrectResponse = () => {
    if (!this.settings.questions.length) return;
    this.store.restoreState({ ...this.store.getState(), answers: keyAnswers(this.settings) }, this.store.getActions?.() ?? []);
  };

  private get readOnly() {
    return ["review", "solution", "closed"].includes(String(this.config.status ?? ""));
  }

  render = () => {
    this.settings = parseSettings(this.config.properties as Record<string, unknown>); // trigger() may have changed them
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={this.config.properties.prompt} settings={this.settings} store={this.store}
        texts={textsFor(this.settings.language)} readOnly={this.readOnly} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /**
   * A record: viewed (the frames the candidate saw move, each with the traces they saw in it), answers
   * ("rim@ground=cycloid;…"), and with questions score, maxscore and correct. Nothing until the candidate saw
   * something move or answered.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.settings;
    const { seen, answers } = this.store.getState();
    const answered = answersText(s, answers);
    if (!seen.length && !answered) return undefined;
    const record: QtiRecordItem[] = [];
    if (s.questions.length) {
      const { score, maxscore, correct } = scoreOf(s, answers);
      record.push(
        { name: "score", base: { integer: score } },
        { name: "maxscore", base: { integer: maxscore } },
        { name: "correct", base: { integer: correct ? 1 : 0 } },
      );
    }
    record.push({ name: "answers", base: { string: answered } }, { name: "viewed", base: { string: viewedText(seen) } });
    return { record };
  };

  resetResponse = () => {
    this.store.restoreState(this.initial(), []);
  };

  /** A response back: the answers and what was viewed (the score follows from the answers). */
  setResponse = (response: QtiVariableJSON) => {
    const answers = parseAnswers(this.settings, field(response, "answers"));
    const seen = parseViewed(field(response, "viewed"));
    this.store.dispatch({ type: "RESTORE", payload: { ...this.store.getState(), answers, seen } });
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions(),
    });
}

export default new App();
