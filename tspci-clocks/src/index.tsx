/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, store.ts the state. The settings are in src/config.json; the
 * response is described by config.tspci.response in package.json (see AUTHORING.md).
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { media } from "@citolab/tspci/media"
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import {
  ConfigProperties, IMSpci, IMSpciAuthoringFactory, IMSpciFactory, PciAuthoringConfiguration, PciAuthoringInstance, PciProperties, QtiInteractionChangedDetail, QtiVariableJSON,
} from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction from "./interaction";
import { Authoring, Choice } from "./authoring";
import { analogSkin, clockType, digitalSkin } from "./skins";
import { Actions, StateModel, initStore } from "./store";
import { Language, clockString, formatTime, parseClockString, parseTime } from "./timeText";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

/**
 * The response for the text in the input: the time as "HH:MM" on a 12-hour clock (a time in words has no morning or
 * afternoon), or undefined while the text is not a time. One answer, one response: "ten past four", "4:10", "16:10" and
 * "four ten" all report "04:10".
 */
function toResponse(value: string, language: Language): QtiVariableJSON | undefined {
  const time = parseTime(value, language);
  return time === null ? undefined : { base: { string: clockString(time) } };
}

/** The plain value in a response (setResponse, boundTo) or a correct response (status "solution"). */
function responseValue(value: unknown): unknown {
  if (Array.isArray(value)) return responseValue(value[0]);
  if (value && typeof value === "object") {
    const base = (value as QtiVariableJSON).base;
    return base?.string ?? base?.integer ?? base?.float;
  }
  return value;
}

/** The font of the digital clocks, for the whole document (a font in a shadow root's CSS is not loaded). */
function loadDigitFont(dom: HTMLElement) {
  const digit = new FontFace("DigitTech", `url(${media("digit", dom)})`);
  digit.load().then((f) => document.fonts.add(f));
}

/** The clock and skin in the settings: a skin that does not belong to the type of clock is its classic one. */
function clockChoice(properties: Partial<PropTypes>): Choice {
  const typeOfClock = clockType(properties.typeOfClock);
  const skin = typeOfClock === "analog" ? analogSkin(properties.skin) : digitalSkin(properties.skin).id;
  return { typeOfClock, skin };
}

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "clocks";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private store: IStore<StateModel, Actions> = initStore();
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = { ...(configProps as unknown as PropTypes), ...config.properties };
    this.dom = dom;
    this.config = config;
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    loadDigitFont(dom);

    // 1. The state from a previous session (whatever getState() returned).
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (typeof state?.value === "string" && Array.isArray(log)) this.store.restoreState(state, log);
      } catch {
        // not ours: start empty
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response of the item instead (AUTHORING.md, "Correct answers").
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine when the response changes.
    this.previousResponse = JSON.stringify(this.getResponse() ?? null);
    this.unsubscribe = this.store.subscribe(this.onStoreChange);

    this.render();
    config.onready?.(this, this.getState());
  }

  private previousResponse: string;
  private unsubscribe = () => {};
  private onStoreChange: Listener<StateModel> = () => {
    const response = JSON.stringify(this.getResponse() ?? null);
    if (response === this.previousResponse) return; // subscribe() calls us right away, and not every action changes it
    this.previousResponse = response;
    // composed lets the event cross the shadow root
    const detail: QtiInteractionChangedDetail = {
      interaction: this,
      responseIdentifier: this.config.responseIdentifier,
      valid: this.checkValidity(),
      value: this.getResponse(),
    };
    this.dom.dispatchEvent(new CustomEvent("qti-interaction-changed", { bubbles: true, composed: true, detail }));
  };

  private render = () => {
    const readOnly = ["review", "solution", "closed"].includes(this.config.status ?? "interacting");
    render(
      <>
        <style>{style}</style>
        <Interaction config={this.config.properties} store={this.store} readOnly={readOnly} />
      </>,
      this.shadowdom
    );
    this.input?.setCustomValidity(this.customValidity);
  };

  private get input() {
    return this.shadowdom.querySelector("input");
  }

  /** Only a change is an action: keeps the log (and a replay) clean. */
  private setValue = (value: string) => {
    if (value !== this.store.getState().value) this.store.dispatch({ type: "SET_VALUE", payload: { value } });
  };

  /** Show the correct response the item declares (status "solution"); without one, keep what is there. */
  showCorrectResponse = () => {
    const correct = this.config.responseDeclaration?.correctResponse?.value;
    if (correct !== undefined) this.show(correct);
  };

  /** The student answers by setting the clock (typeOfQuestion "setClock"), not by typing the time. */
  private get setsClock() {
    return this.config.properties.typeOfQuestion === "setClock";
  }

  /** Only a digital clock with the 24-hour setting (on by default) tells morning and afternoon apart. */
  private get twentyFourHour() {
    const { typeOfClock, twentyFourHour } = this.config.properties;
    return typeOfClock === "digital" && String(twentyFourHour) !== "false";
  }

  /**
   * The time the student set on the clock, as "HH:MM" (clockString); null while the clock was not touched. The digital
   * clock sets hours and minutes apart: the part that was not set yet is the one of the initial time it shows.
   */
  private clockTime(): string | null {
    const { hour, minute } = this.store.getState();
    if (hour == null && minute == null) return null;
    const [, initialHour, initialMinute] = /(\d{1,2}):(\d{2})/.exec(this.config.properties.initialtime ?? "") ?? [];
    return clockString((hour ?? Number(initialHour ?? 12)) * 60 + (minute ?? Number(initialMinute ?? 0)), this.twentyFourHour);
  }

  /** Show a response or a correct response ("HH:MM"): on the clock, or in words in the input. */
  private show = (response: unknown) => {
    const value = responseValue(response);
    const time = typeof value === "string" ? parseClockString(value) : null;
    if (!this.setsClock) return this.setValue(time === null ? String(value ?? "") : formatTime(time, this.language));
    if (time === null || clockString(time, this.twentyFourHour) === this.clockTime()) return; // only a change is an action
    // the analog clock and a 12-hour digital clock count the hours from 0 to 11 (12:10 is 0:10)
    const hour = Math.floor(time / 60) % (this.twentyFourHour ? 24 : 12);
    this.store.dispatch({ type: "SET_TIME", payload: { hour, minute: time % 60 } });
  };

  /** The language the student answers in (the setting): "half 7" is 7:30 in English and 6:30 in Dutch. */
  private get language(): Language {
    return this.config.properties.language === "nl" ? "nl" : "en";
  }

  // ---- the IMS PCI API ----

  getResponse = (): QtiVariableJSON | undefined => {
    if (!this.setsClock) return toResponse(this.store.getState().value, this.language);
    const time = this.clockTime();
    return time === null ? undefined : { base: { string: time } };
  };

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.show(response);

  checkValidity = () => this.input?.checkValidity() ?? true;

  reportValidity = () => this.input?.reportValidity() ?? true;

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
    this.input?.setCustomValidity(this.customValidity);
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount (which also runs the components' cleanups). */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "clocks", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // No getCorrectResponse: the author gives the correct response in the item (AUTHORING.md, "Correct answers").

  /**
   * The authoring mode (AUTHORING.md, section 6): the author picks the clock and its skin (authoring.tsx), which gives
   * the settings typeOfClock and skin. A player never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...(configProps as unknown as PropTypes), ...config.properties } as PropTypes;
    let choice = clockChoice(properties);
    const language = (config.language ?? "en").slice(0, 2) === "nl" ? "nl" : "en"; // the author's language
    loadDigitFont(dom);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          properties={properties}
          initial={choice}
          language={language}
          onChange={(next) => {
            choice = next;
            config.onchange?.();
          }}
        />
      </>,
      shadow
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ typeOfClock: choice.typeOfClock, skin: choice.skin }),
      oncompleted: () => render(null, shadow),
    };
    config.onready?.(instance);
    return instance;
  },
};

// Register with the engine: as an AMD module (qtiCustomInteractionContext), or through the global some engines set.
type Context = { register: (factory: IMSpciFactory<PropTypes>) => void };
const engineContext = [ctx as unknown as Context, (globalThis as { qtiCustomInteractionContext?: Context }).qtiCustomInteractionContext].find(
  (c) => typeof c?.register === "function"
);
engineContext?.register(factory);

export default factory;
