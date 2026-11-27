/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store: money (rekenen met geld).
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, store.ts the state, money.ts the arithmetic (in cents) and the
 * response, pieces.tsx the stylised coins and notes (look.ts their sizes and colours), authoring.tsx the authoring mode
 * for the currency and its coins and notes. The `task` setting:
 * - pay: put money on the counter to pay an amount exactly; fewest: with as few coins and notes as possible
 * - change: the price and what the customer pays with; give the change (changeFewest: in as few pieces as possible)
 * - count: the counter holds the author's money; the candidate writes how much it is
 * - register: a cash register (shop.tsx, till.ts): ring up the shopping, key in the total (or let the till calculate
 *   it) and what the customer pays, and give the change from the till's drawer
 * The response is a record (config.tspci.response in package.json, AUTHORING.md): amount and exact, plus pieces and
 * fewest where the task asks for the fewest; answer and exact for count; for the register what was rung up, the total,
 * the payment and the change (money.ts registerRecord). Nothing until the candidate answers.
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import {
  ConfigProperties, IMSpci, IMSpciAuthoringFactory, IMSpciFactory, PciAuthoringConfiguration, PciAuthoringInstance, PciProperties,
  QtiInteractionChangedDetail, QtiVariableJSON,
} from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction from "./interaction";
import { TaskModel, amountText, answerCents, correctFor, pileFor, readResponse, responseFor, taskFrom } from "./money";
import { Actions, StateModel, initStore, isState, tillIn } from "./store";
import { registerResponse, tillContext, tillFor } from "./till";
import { languageOf, textsFor } from "./texts";
import { Authored, Authoring, authoredFrom, authoredProblems, authoredProperties } from "./authoring";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

const withDefaults = (properties: Partial<PropTypes>) => ({ ...(configProps as unknown as PropTypes), ...properties });

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "money";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private model: TaskModel;
  private store: IStore<StateModel, Actions>;
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = withDefaults(config.properties);
    this.dom = dom;
    this.config = config;
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    // 0. The task from the settings: the currency and its coins and notes, the amount, the customer's money, the money
    // to count, the supply.
    this.model = taskFrom(config.properties);
    this.store = initStore(this.model.supply, undefined, this.model.register ? tillContext(this.model) : undefined);
    // 1. The state from a previous session (whatever getState() returned) wins over the settings.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (isState(state) && Array.isArray(log)) this.store.restoreState(state, log);
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

    // From here on, tell the engine when anything changes.
    this.previousState = JSON.stringify(this.store.getState());
    this.unsubscribe = this.store.subscribe(this.onStoreChange);

    this.render();
    config.onready?.(this, this.getState());
  }

  private previousState: string;
  private unsubscribe = () => {};
  private onStoreChange: Listener<StateModel> = (state) => {
    const json = JSON.stringify(state);
    if (json === this.previousState) return; // subscribe() calls us right away, and an action may change nothing
    this.previousState = json;
    this.syncValidity();
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
        <Interaction config={this.config.properties} model={this.model} store={this.store} readOnly={readOnly} />
      </>,
      this.shadowdom
    );
    this.syncValidity();
  };

  /**
   * The answer box is invalid with the engine's message (setCustomValidity), or when it holds something that is not an
   * amount of the currency ("veel", "7,355"): the box shows it, and checkValidity() reports it.
   */
  private syncValidity = () => {
    const answer = this.store.getState().answer;
    const notAnAmount = answer.trim() !== "" && answerCents(answer, this.model.currency) === null;
    const t = textsFor(this.config.properties.language, this.model);
    this.input?.setCustomValidity(this.customValidity || (notAnAmount ? t.notAnAmount : ""));
  };

  /** The answer box of the count task (data-answer in interaction.tsx). */
  private get input() {
    return this.shadowdom.querySelector<HTMLInputElement>("input[data-answer]");
  }

  /**
   * Put a response on the counter (or in the answer box): the response says how much, not which coins and notes, so
   * the counter gets the fewest that make it from the supply. Only a change is an action: keeps the log clean.
   */
  private show = (value: unknown) => {
    const state = this.store.getState();
    if (this.model.task === "register") {
      // the register: the till (what was rung up, the total, the payment) and the change on the counter
      const shown = tillFor(value, this.model);
      if (!shown) return;
      if (JSON.stringify(shown.till) !== JSON.stringify(tillIn(state))) this.store.dispatch({ type: "SET_TILL", payload: { till: shown.till } });
      if (JSON.stringify(shown.tray) !== JSON.stringify(state.tray)) this.store.dispatch({ type: "SET_TRAY", payload: { tray: shown.tray } });
      return;
    }
    const { cents } = readResponse(value, this.model.currency);
    if (cents === null) return;
    if (this.model.task === "count") {
      const text = amountText(cents, this.config.properties.language, this.model.currency);
      if (text !== state.answer) this.store.dispatch({ type: "SET_ANSWER", payload: { value: text } });
      return;
    }
    const pile = pileFor(cents, this.model.supply);
    if (pile && JSON.stringify(pile) !== JSON.stringify(state.tray)) this.store.dispatch({ type: "SET_TRAY", payload: { tray: pile } });
  };

  /** Show the correct response the item declares (status "solution"); without one, the one from the settings. */
  showCorrectResponse = () => {
    const correct = this.config.responseDeclaration?.correctResponse?.value ?? correctFor(this.model);
    if (correct !== undefined) this.show(correct);
  };

  // ---- the IMS PCI API ----

  getResponse = () => {
    const { tray, answer } = this.store.getState();
    const response = this.model.task === "register" ? registerResponse(this.model, tillIn(this.store.getState()), tray) : responseFor(this.model, tray, answer);
    return response as QtiVariableJSON | undefined;
  };

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.show(response);

  checkValidity = () => (this.customValidity === "" ? (this.input?.checkValidity() ?? true) : false);

  reportValidity = () => this.input?.reportValidity() ?? this.checkValidity();

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
    this.syncValidity();
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount (which also runs the components' cleanups). */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "money", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // The asked amount, exact, and in the fewest pieces where the task asks for it; for the register the shopping rung
  // up, its total, the customer's money and the change (money.ts correctFor).
  getCorrectResponse: (properties) => correctFor(taskFrom(withDefaults(properties))) as QtiVariableJSON | undefined,

  /**
   * The authoring mode (AUTHORING.md, section 6): the author picks the currency and sets up its coins and notes
   * (authoring.tsx). It writes the settings currency, currencySign, currencyPosition, minorUnit and pieces. A player
   * never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = withDefaults(config.properties ?? {});
    const language = languageOf(config.language); // the author's language
    let authored: Authored = authoredFrom(properties, language);
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          initial={authored}
          properties={properties}
          language={language}
          onChange={(next) => {
            authored = next;
            config.onchange?.();
          }}
        />
      </>,
      shadow
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => authoredProperties(authored),
      validate: () => authoredProblems(authored, properties, language),
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
