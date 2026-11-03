// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/brainstorm, © openPCI (Aarhus University and Aalborg
// University): Elias J.T. Hansen, Anna Rusmann & Jeppe Bundsgaard
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import { IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties } from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore, initialState } from "./store";
import { BotLine, parseLog, parseScript, serializeLog } from "./script";
import { Session } from "./session";
import { textsFor } from "./texts";
// config.json carries editor hints for authoring systems; the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("timelimit"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

class App implements IMSpci<PropTypes>, TAOpci {
  typeIdentifier = "brainstorm";
  store: IStore<StateModel, Actions>;
  session: Session;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  script: BotLine[];
  dom: HTMLElement;

  constructor() {
    if (ctx) {
      ctx.register(this);
    }
  }

  private get nickname() {
    return String(this.config.properties.nickname ?? "").trim() || "You";
  }

  private get timeLimit() {
    return parseInt(String(this.config.properties.timeLimit), 10) || 60; // as the original
  }

  /** Review, solution or closed: show the chat, do not run it. */
  private get readOnly() {
    const status = this.config.status;
    return status === "review" || status === "solution" || status === "closed";
  }

  getInstance = (dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString: string) => {
    config.properties = { ...defaults, ...normalize(config.properties as Record<string, string>) }; // defaults, then the item's
    this.config = config;
    this.dom = dom;
    this.script = parseScript(this.config.properties.messages);

    let restored: StateModel | null = null;
    let actions = [];
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state && Array.isArray(saved.state.log)) {
          restored = { ...initialState, ...saved.state };
          actions = saved.log ?? [];
        }
      } catch {
        // not a state of this PCI: start afresh
      }
    }
    this.store = initStore();
    if (restored) this.store.restoreState(restored, actions);

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    this.newSession();

    if (!restored && this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (response?.base?.string) this.setResponse(response);
    }
    this.begin();

    // From here on, tell the Delivery System when the interaction changes (a new message, the start, the end)
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

  private newSession = () => {
    this.session?.stop();
    this.session = new Session(this.store, this.script, this.timeLimit, this.nickname);
    this.render();
  };

  /** Without a start message the brainstorm starts right away; a restored one goes on. */
  private begin = () => {
    if (this.readOnly) return;
    const { phase } = this.store.getState();
    if (phase === "running") this.session.resume();
    else if (phase === "waiting" && !String(this.config.properties.startText ?? "").trim()) this.session.start();
  };

  render = () => {
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    const p = this.config.properties;
    render(
      <Interaction session={this.session} store={this.store} texts={textsFor(p.language)} nickname={this.nickname}
        startText={String(p.startText ?? "")} endText={String(p.endText ?? "")} readOnly={this.readOnly} />,
      this.shadowdom
    );
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  /** A setting changed in the authoring system: start the brainstorm over with it, as the original did. */
  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    this.script = parseScript(this.config.properties.messages);
    this.session?.stop();
    this.store.reset();
    this.newSession();
    this.begin();
  };

  /** All messages, the bots' and the candidate's, as `|mm:ss;name;message|…` (the original's format). */
  getResponse = () => {
    const { log } = this.store.getState();
    if (log.length === 0) return undefined;
    return { base: { string: serializeLog(log) } };
  };

  resetResponse = () => {
    this.session?.stop();
    this.store.reset();
    this.newSession();
    this.begin();
  };

  /** A response from the delivery system: shown as a finished chat. */
  setResponse = (response: QtiVariableJSON) => {
    const value = response?.base?.string;
    if (typeof value !== "string" || !value) return;
    this.session?.stop();
    this.store.dispatch({ type: "SHOW", payload: { log: parseLog(value, this.nickname, this.script) } });
  };

  oncompleted = () => {
    this.session?.stop();
    this.store.unsubscribeAll();
  };

  getState = () =>
    JSON.stringify({
      state: { ...this.store.getState(), elapsed: Math.round(this.session.elapsed), botClock: Math.round(this.session.botClock) },
      log: this.store.getActions(),
    });
}

export default new App();
