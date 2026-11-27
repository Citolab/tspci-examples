/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * This file is the PCI API; interaction.tsx is the UI, store.ts the state, calculation.ts the methods and their checks
 * (tested in node). Written calculation as Dutch primary schools teach it: the hapmethode (mode "chunking") and
 * kolomsgewijs adding and subtracting (mode "columns"). The response is a record (config.tspci.response in
 * package.json): the answer (and the remainder of a division), whether the working is correct whatever the route,
 * and whether the answer is correct. The working itself is kept in the state, so a rater can see it.
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import { ConfigProperties, IMSpci, IMSpciFactory, PciProperties, QtiInteractionChangedDetail, QtiVariableJSON } from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction from "./interaction";
import { Actions, StateModel, initStore } from "./store";
import {
  Task, correctFields, formatNumber, fromResponse, notANumber, ownWork, parseTask, responseFields, solutionWork, startWork, taskProblems, toRecord,
} from "./calculation";
import { textsFor } from "./texts";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

const languageOf = (properties: Partial<PropTypes>) => (properties.language === "nl" ? "nl" : "en");
const chunksOf = (properties: Partial<PropTypes>) => Number.parseInt(properties.chunks ?? "", 10);

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "writtenCalculation";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private store: IStore<StateModel, Actions>;
  private task: Task;
  private customValidity = "";

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = { ...(configProps as unknown as PropTypes), ...config.properties };
    this.dom = dom;
    this.config = config;
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    // 0. An empty working for the task of the settings.
    this.task = parseTask(config.properties);
    this.store = initStore({ work: startWork(this.task, chunksOf(config.properties)) });
    // 1. The state from a previous session (whatever getState() returned) wins over the settings.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (state?.work && Array.isArray(log)) this.store.restoreState({ work: ownWork(this.task, state.work, chunksOf(config.properties)) }, log);
      } catch {
        // not ours: start empty
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response, with a worked solution (AUTHORING.md, "Correct answers").
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine when anything changes: the response, or only the working.
    this.previousState = JSON.stringify(this.store.getState());
    this.unsubscribe = this.store.subscribe(this.onStoreChange);

    this.render();
    config.onready?.(this, this.getState());
  }

  private previousState: string;
  private unsubscribe = () => {};
  /**
   * Every change of the state is an event, also one that leaves the response as it is (a bite, a partial): an engine
   * then calls getState() again, so the working is saved too.
   */
  private onStoreChange: Listener<StateModel> = (state) => {
    const json = JSON.stringify(state);
    if (json === this.previousState) return; // subscribe() calls us right away, and an action may change nothing
    this.previousState = json;
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
        <Interaction config={this.config.properties} store={this.store} task={this.task} problems={taskProblems(this.task)} readOnly={readOnly} />
      </>,
      this.shadowdom
    );
  };

  /** The answer box (interaction.tsx), for reportValidity. */
  private get input() {
    return this.shadowdom.querySelector<HTMLInputElement>("#answer");
  }

  /** The answer or the remainder is text that is not a number. */
  private get answerInvalid() {
    const { work } = this.store.getState();
    const language = languageOf(this.config.properties);
    return notANumber(work.answer, language) || (this.task.mode === "chunking" && notANumber(work.remainder, language));
  }

  /** Put an answer (and remainder) in the answer boxes; the working stays as it is. */
  private setAnswer = (given: { answer: number; remainder?: number } | null) => {
    if (!given) return;
    const language = languageOf(this.config.properties);
    const { work } = this.store.getState();
    const next = {
      ...work,
      answer: formatNumber(given.answer, language),
      remainder: this.task.mode === "chunking" && given.remainder !== undefined ? String(given.remainder) : work.remainder,
    };
    this.store.restoreState({ work: next }, this.store.getActions());
  };

  /**
   * Show the correct response (status "solution"): the one the item declares, or else the one from the settings, with
   * a worked solution of the method above it.
   */
  showCorrectResponse = () => {
    const declared = fromResponse(this.config.responseDeclaration?.correctResponse?.value ?? this.config.responseDeclaration?.correctResponse);
    const work = solutionWork(this.task, declared, languageOf(this.config.properties));
    if (!work.answer) return; // broken settings and nothing declared
    this.store.restoreState({ work }, []);
  };

  // ---- the IMS PCI API

  getResponse = (): QtiVariableJSON | undefined => {
    const fields = responseFields(this.task, this.store.getState().work, languageOf(this.config.properties));
    return fields ? (toRecord(fields) as QtiVariableJSON) : undefined;
  };

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => this.setAnswer(fromResponse(response));

  checkValidity = () => !this.customValidity && !this.answerInvalid;

  reportValidity = () => {
    const valid = this.checkValidity();
    const input = this.input;
    if (input) {
      input.setCustomValidity(this.customValidity || (this.answerInvalid ? textsFor(this.config.properties.language).notANumber : ""));
      input.reportValidity();
    }
    return valid;
  };

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount. */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

const factory: IMSpciFactory<PropTypes> = {
  typeIdentifier: "writtenCalculation", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  // The question is in the settings, so is the answer: the answer (and remainder), a correct working.
  getCorrectResponse: (properties) => {
    const fields = correctFields(parseTask({ ...(configProps as unknown as PropTypes), ...properties }));
    return fields ? (toRecord(fields) as QtiVariableJSON) : undefined;
  },
};

// Register with the engine: as an AMD module (qtiCustomInteractionContext), or through the global some engines set.
type Context = { register: (factory: IMSpciFactory<PropTypes>) => void };
const engineContext = [ctx as unknown as Context, (globalThis as { qtiCustomInteractionContext?: Context }).qtiCustomInteractionContext].find(
  (c) => typeof c?.register === "function"
);
engineContext?.register(factory);

export default factory;
