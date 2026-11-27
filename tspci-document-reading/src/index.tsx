/*
 * A Portable Custom Interaction (PCI) with Preact, Tailwind and a store.
 *
 * The delivery engine (the player) loads this bundle, which registers a factory with qtiCustomInteractionContext.
 * For every interaction in an item the engine calls factory.getInstance(dom, config, state); the instance renders
 * into `dom` and reports its answer through getResponse().
 *
 * Documents lezen (document reading): a realistic but made-up document, drawn from data as HTML tables (a payslip, a
 * till receipt, a packing slip next to the delivery, a staff rota, a bus timetable, an energy bill, a medicine
 * leaflet's dosage table). The pupil taps the field the question asks for (find), taps every mistake (check), or types
 * a number and may tap where they found it (answer). This file is the PCI API; interaction.tsx is the UI,
 * documentView.tsx the document, authoring.tsx the authoring mode, store.ts the state and documents.ts the logic (the
 * templates, the computed fields, the mistakes, the response).
 */
import "preact/debug"; // readable warnings in the browser console while developing
import { render } from "preact";
import { Action, IStore, Listener } from "@citolab/preact-store";
import {
  ConfigProperties, IMSpci, IMSpciAuthoringFactory, IMSpciFactory, PciAuthoringConfiguration, PciAuthoringInstance, PciProperties,
  QtiInteractionChangedDetail, QtiRecordItem, QtiVariableJSON,
} from "@citolab/tspci";
import * as ctx from "qtiCustomInteractionContext"; // provided by the delivery engine at runtime
import configProps from "./config.json"; // the settings; the build passes only their defaults (AUTHORING.md)
import style from "./styles.css"; // Tailwind, compiled to a string, added to the shadow root below
import Interaction from "./interaction";
import { Authoring, Authored, authoredFrom, authoredProblems, authoredProperties } from "./authoring";
import { Answer, Model, ResponseField, answerFromRecord, correctAnswer, modelFrom, parseNumber, responseFields } from "./documents";
import { Actions, StateModel, initStore } from "./store";

// Like every data- attribute, each setting arrives as a string.
type PropTypes = PciProperties<typeof configProps>;

/** What getState() saves: the state and the actions that led to it. */
type PciStoredState = { state: StateModel; log: Action<unknown>[] };

/** The document and task a state belongs to. */
const layoutKey = (properties: Partial<PropTypes>, model: Model) =>
  JSON.stringify([model.template, model.task, model.language, properties.document ?? ""]);

const recordItem = ({ name, type, value }: ResponseField): QtiRecordItem => ({ name, base: { [type]: value } as QtiRecordItem["base"] });
const toRecord = (fields: ResponseField[] | null): QtiVariableJSON | undefined => (fields ? { record: fields.map(recordItem) } : undefined);

/** The fields of a record (a response, a correct response), as { name, value }. */
function recordFields(value: unknown): { name: string; value: unknown }[] | null {
  if (Array.isArray(value)) return value.length && value.every((v) => v && typeof v === "object" && "name" in v) ? recordFields({ record: value }) : recordFields(value[0]);
  const record = (value as { record?: { name: string; base?: Record<string, unknown> }[] } | null)?.record;
  if (!Array.isArray(record)) return null;
  return record.map(({ name, base }) => ({ name, value: base ? Object.values(base)[0] : undefined }));
}

/** The correct response for the settings: the right field, every mistake found, or the answer (and where it is). */
function correctResponse(properties: Partial<PropTypes>): QtiVariableJSON | undefined {
  const model = modelFrom({ ...(configProps as unknown as PropTypes), ...properties });
  const answer = correctAnswer(model);
  return answer ? toRecord(responseFields(model, answer)) : undefined;
}

let instances = 0;

class PciInstance implements IMSpci<PropTypes> {
  typeIdentifier = "documentReading";
  private config: ConfigProperties<PropTypes>;
  private dom: HTMLElement;
  private shadowdom: ShadowRoot;
  private model: Model;
  private store: IStore<StateModel, Actions>;
  private customValidity = "";
  private uid = `document-reading-${++instances}`;

  constructor(dom: HTMLElement, config: ConfigProperties<PropTypes>, stateString?: string) {
    if (!dom) throw new Error("No DOM Element provided");
    // The item's data- attributes override the defaults from config.json.
    config.properties = { ...(configProps as unknown as PropTypes), ...config.properties };
    this.dom = dom;
    this.config = config;
    // A closed shadow root keeps the item's CSS out and ours (Tailwind) in.
    this.shadowdom = dom.attachShadow({ mode: "closed" });

    // 0. The document of the settings, nothing tapped yet.
    this.model = modelFrom(config.properties);
    const layout = layoutKey(config.properties, this.model);
    this.store = initStore({ layout, marked: [], typed: "" });
    // 1. The state from a previous session (whatever getState() returned) wins over the settings, if it is of this document.
    if (stateString) {
      try {
        const { state, log } = JSON.parse(stateString) as PciStoredState;
        if (state?.layout === layout && Array.isArray(state.marked) && Array.isArray(log)) {
          const marked = state.marked.filter((id) => typeof id === "string" && this.model.doc.byId[id]);
          this.store.restoreState({ ...this.store.getState(), marked, typed: String(state.typed ?? "") }, log);
        }
      } catch {
        // not ours: start from the settings
      }
    }
    // 2. A response the engine binds to the interaction (boundTo) wins over the state.
    const boundTo = config.boundTo ?? {};
    const bound = boundTo[config.responseIdentifier] ?? (Object.keys(boundTo).length === 1 ? Object.values(boundTo)[0] : undefined);
    if (bound) this.setResponse(bound);
    // 3. Status "solution": show the correct response of the item instead.
    if (config.status === "solution") this.showCorrectResponse();

    // From here on, tell the engine about every change.
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
        <Interaction config={this.config.properties} model={this.model} store={this.store} readOnly={readOnly} uid={this.uid} />
      </>,
      this.shadowdom
    );
  };

  private get answer(): Answer {
    const { marked, typed } = this.store.getState();
    return { marked, typed };
  }

  /** Show what a response (or a correct response) says. Only a change is an action: keeps the log clean. */
  private show = (answer: Answer | null) => {
    if (!answer) return;
    const { marked, typed } = this.store.getState();
    if (JSON.stringify(marked) !== JSON.stringify(answer.marked) || typed !== answer.typed) this.store.dispatch({ type: "SET_ALL", payload: answer });
  };

  /** Show the correct response the item declares (status "solution"), or else the one that follows from the settings. */
  showCorrectResponse = () => {
    const fields = recordFields(this.config.responseDeclaration?.correctResponse?.value);
    const declared = fields ? answerFromRecord(this.model, fields) : null;
    this.show(declared && (declared.marked.length || declared.typed) ? declared : correctAnswer(this.model));
  };

  // ---- the IMS PCI API ----

  /** Undefined until the pupil tapped a field or typed an answer: nothing answered, nothing reported. */
  getResponse = (): QtiVariableJSON | undefined => toRecord(responseFields(this.model, this.answer));

  getState = () => JSON.stringify({ state: this.store.getState(), log: this.store.getActions() } satisfies PciStoredState);

  setResponse = (response: QtiVariableJSON) => {
    const fields = recordFields(response);
    this.show(fields ? answerFromRecord(this.model, fields) : null);
  };

  /** Valid unless the answer box holds something that is not a number, or the player set a message. */
  checkValidity = () => {
    const { typed } = this.store.getState();
    return this.customValidity === "" && (typed.trim() === "" || parseNumber(typed, this.model.language) !== null);
  };

  reportValidity = () => this.checkValidity();

  setCustomValidity = (message: string) => {
    this.customValidity = message ?? "";
  };

  getCustomValidity = () => this.customValidity;

  /** The engine is done with this instance: unsubscribe and unmount (which also runs the components' cleanups). */
  oncompleted = () => {
    this.unsubscribe();
    render(null, this.shadowdom);
  };
}

const factory: IMSpciAuthoringFactory<PropTypes> = {
  typeIdentifier: "documentReading", // the same as config.tspci.typeIdentifier in package.json
  getInstance: (dom, config, state) => new PciInstance(dom, config, state),
  getCorrectResponse: (properties) => correctResponse(properties),

  /**
   * The authoring mode (AUTHORING.md, section 6): the author picks a document and a task, changes its values in a
   * form, makes computed fields wrong on purpose (check) and taps the field the pupil has to find or where the answer
   * is (authoring.tsx). It writes the settings template, task, language, question, document, targets, answer,
   * tolerance, unit and markSource. A player never calls it.
   */
  getAuthoringInstance: (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...(configProps as unknown as PropTypes), ...config.properties } as PropTypes;
    let authored: Authored = authoredFrom(properties);
    const language = (config.language ?? "").slice(0, 2) === "nl" ? "nl" : "en"; // the author's language
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    render(
      <>
        <style>{style}</style>
        <Authoring
          initial={authored}
          language={language}
          currency={properties.currency || "€"}
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
      validate: () => authoredProblems(authored, language),
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
