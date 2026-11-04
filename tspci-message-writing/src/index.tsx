import "preact/debug";
import { render } from "preact";
import * as ctx from "qtiCustomInteractionContext";
import Interaction from "./interaction";
import Authoring, { authoringProblems } from "./authoring";
import style from "./style.css";
import { TAOpci } from "@citolab/tspci-tao";
import {
  IMSpci, QtiVariableJSON, QtiInteractionChangedDetail, ConfigProperties, PciProperties, IMSpciAuthoringFactory, PciAuthoringConfiguration,
  PciAuthoringInstance, QtiRecordItem,
} from "@citolab/tspci";
import { IStore } from "@citolab/preact-store";

import configProps from "./config.json";
import { Actions, StateModel, initStore } from "./store";
import {
  Answer, ENVIRONMENTS, Environment, MAX_CHECKS, Scenario, WRITING_LANGUAGES, WritingLanguage, countChars, countWords, evaluate, messageText,
  chatAnswer, lastStepOf, parseAddresses, parseScenario, replay, sentOf, serializeScenario, startChat, toHtml, type ChatEntry,
} from "./message";
import { textsFor } from "./texts";
import { localIso } from "./context";

// config.json carries editor hints for authoring systems (AUTHORING.md); the build passes only the defaults, as strings
type PropTypes = PciProperties<typeof configProps>;
const defaults = configProps as unknown as PropTypes;

/** HTML attributes arrive in lower case in some delivery systems ("writinglanguage"): back to the keys of config.json. */
const normalize = (properties: Record<string, string> = {}) =>
  Object.keys(defaults).reduce((acc, key) => {
    const match = Object.keys(properties).find((k) => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) acc[key] = properties[match];
    return acc;
  }, {} as Record<string, string>);

const isTrue = (value: unknown) => String(value).toLowerCase() === "true";

/** The labels of the plain-text message: always English, so the response does not depend on the item's language. */
const LABELS = { to: "To", cc: "Cc", subject: "Subject", attachments: "Attachments", me: "", draft: "not sent", notSent: "not sent" };

/**
 * The fields of a response, a correct response or a saved value, by name: a record ({ record: [{ name, base }] }),
 * a declaration's values ([{ fieldIdentifier, value }]), an object of fields, or a plain string (the text).
 */
const fieldsOf = (value: any): Record<string, string> | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const v = value.trim();
    if (v.startsWith("{")) {
      try {
        return fieldsOf(JSON.parse(v));
      } catch {
        /* the text itself */
      }
    }
    return { text: value };
  }
  const out: Record<string, string> = {};
  const put = (name: unknown, v: any) => {
    if (typeof name !== "string") return;
    const base = v?.base ?? v;
    const s = base && typeof base === "object" ? base.string ?? base.integer ?? base.float ?? base.identifier : base;
    if (s !== undefined && s !== null && typeof s !== "object") out[name] = String(s);
  };
  if (Array.isArray(value?.record)) value.record.forEach((f: any) => put(f?.name, f));
  else if (Array.isArray(value)) value.forEach((f: any) => put(f?.fieldIdentifier ?? f?.name, f?.value ?? f));
  else if (value?.base?.string !== undefined) return fieldsOf(value.base.string);
  else if (typeof value === "object") Object.entries(value).forEach(([k, v]) => put(k, v));
  return Object.keys(out).length ? out : null;
};

const list = (s: string | undefined) => (s ?? "").split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);

class App implements IMSpci<PropTypes>, TAOpci, IMSpciAuthoringFactory<PropTypes> {
  typeIdentifier = "messageWriting";
  store: IStore<StateModel, Actions>;
  shadowdom: ShadowRoot; // implementation detail
  config: ConfigProperties<PropTypes>;
  scenario: Scenario;
  environment: Environment;

  private initialState: StateModel;
  // The correct response the delivery engine handed us at getInstance time, or else the author's model answer.
  private correctResponse: QtiVariableJSON | null = null;
  /** seconds of earlier sessions, and when this one started */
  private started = Date.now();
  private baseSeconds = 0;
  /** the chat messages the candidate saw before: they do not arrive again */
  private seen = 0;

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
    this.parseSettings();

    this.initialState = this.startState();
    this.store = initStore(this.initialState);
    let restored = false;
    if (stateString) {
      try {
        // getState() saves { state, log }
        const saved = JSON.parse(stateString);
        if (saved?.state?.email && saved?.state?.chat && saved?.state?.post) {
          this.store.restoreState({ ...this.initialState, ...saved.state }, saved.log ?? []);
          this.baseSeconds = Number(saved.state.seconds) || 0;
          restored = true;
        }
      } catch {
        // not a state of this PCI: start as the item starts
      }
    }
    this.correctResponse = this.correctResponseFromDeclaration(config.responseDeclaration) ?? this.modelResponse();

    this.shadowdom = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    if (this.config.boundTo && Object.keys(this.config.boundTo).length > 0) {
      const responseIdentifier = Object.keys(this.config.boundTo)[0];
      const response = this.config.boundTo[responseIdentifier];
      if (!stateString && fieldsOf(response)) {
        this.setResponse(response);
        restored = true;
      }
    }
    // The item is in solution status: the correct response (from the engine, or the author's model answer)
    if (this.config.status === "solution" && this.correctResponse) {
      this.setResponse(this.correctResponse);
      restored = true;
    }
    this.seen = restored ? this.store.getState().chat.transcript.length : 0;
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

  private parseSettings = () => {
    const p = this.config.properties;
    this.scenario = parseScenario(p.scenario);
    this.environment = ENVIRONMENTS.includes(p.environment as Environment) ? (p.environment as Environment) : "email";
  };

  private get writingLanguage(): WritingLanguage {
    const l = String(this.config.properties.writingLanguage ?? "en").toLowerCase().slice(0, 2) as WritingLanguage;
    return WRITING_LANGUAGES.includes(l) ? l : "en";
  }

  /** The state as the item starts: the inbox (or a new message or a reply open), the chat's first messages. */
  private startState = (): StateModel => {
    const s = this.scenario;
    const start = s.email.start;
    const reply = start.startsWith("reply:") ? s.email.inbox.find((m) => `reply:${m.id}` === start) : null;
    const chat = startChat(s.chat, localIso(), s.me.name);
    return {
      email: {
        view: reply || start === "new" ? "compose" : "inbox",
        read: reply ? [reply.id] : [],
        replyTo: reply?.id ?? null,
        to: reply ? reply.from.address : "",
        cc: "",
        subject: reply ? `${/^re:/i.test(reply.subject) ? "" : "Re: "}${reply.subject}` : "",
        body: "",
        attachments: [],
        sent: null,
      },
      chat: { ...chat, draft: "" },
      post: { text: "", posted: null },
      spellcheck: this.config.properties.spellcheck === "on",
      seconds: 0,
    };
  };

  private elapsed = () => Math.round(this.baseSeconds + (Date.now() - this.started) / 1000);

  /** Paints the correct response (from the engine, or the author's model answer); a delivery engine calls this in review. */
  showCorrectResponse = () => {
    if (!this.correctResponse) return;
    this.setResponse(this.correctResponse);
  };

  private correctResponseFromDeclaration = (declaration: ConfigProperties<PropTypes>["responseDeclaration"]): QtiVariableJSON | null => {
    const fields = fieldsOf(declaration?.correctResponse?.value ?? declaration?.correctResponse);
    return fields ? this.responseFor(this.stateFromFields(fields)) : null;
  };

  /** The author's model answer for the environment, as a response. */
  private modelResponse = (): QtiVariableJSON | null => {
    const s = this.scenario;
    if (this.environment === "email" && s.email.model && (s.email.model.body || s.email.model.subject || s.email.model.to)) {
      const m = s.email.model;
      return this.responseFor(this.stateFromFields({ to: m.to ?? "", cc: m.cc ?? "", subject: m.subject ?? "", text: m.body ?? "", attachments: (m.attachments ?? []).join(", "), sent: "1" }));
    }
    if (this.environment === "chat" && s.chat.model?.length) return this.responseFor(this.stateFromFields({ replies: JSON.stringify(s.chat.model) }));
    if (this.environment === "post" && s.post.model) return this.responseFor(this.stateFromFields({ text: s.post.model, sent: "1" }));
    return null;
  };

  /** A state from the fields of a response: the text, and per environment the header, the chat or the post. */
  private stateFromFields = (f: Record<string, string>): StateModel => {
    const start = this.startState();
    const now = localIso();
    const sent = f.sent === "1" ? now : null;
    if (this.environment === "email") {
      return {
        ...start,
        email: {
          ...start.email, view: sent ? "sent" : "compose", to: f.to ?? start.email.to, cc: f.cc ?? "", subject: f.subject ?? start.email.subject, body: f.text ?? "",
          attachments: list(f.attachments), sent,
        },
        seconds: Number(f.seconds) || 0,
      };
    }
    if (this.environment === "chat") {
      let transcript: ChatEntry[] | null = null;
      try {
        const t = f.transcript ? JSON.parse(f.transcript) : null;
        if (Array.isArray(t)) {
          transcript = t.filter((e) => e && typeof e.text === "string").map((e) => {
            const entry: ChatEntry = { from: String(e.from ?? ""), text: e.text, time: String(e.time ?? now) };
            if (e.me) entry.me = true;
            if (["system", "card", "choice", "name"].includes(e.kind)) entry.kind = e.kind;
            if (typeof e.title === "string") entry.title = e.title;
            if (typeof e.choice === "string") entry.choice = e.choice;
            return entry;
          });
        }
      } catch {
        /* the replies, or the text */
      }
      // what the candidate sent (replies, chosen options, a name), answered by the script again
      let replies: string[] = transcript ? sentOf(transcript) : [];
      if (!transcript) {
        try {
          replies = f.replies ? JSON.parse(f.replies) : (f.text ?? "").split(/\n\s*\n/);
        } catch {
          replies = [];
        }
      }
      const chat = replay(this.scenario.chat, replies.map(String).filter((r) => r.trim()), now, this.scenario.me.name);
      // the times of the saved transcript, when the script gives the same conversation
      if (transcript && transcript.length === chat.transcript.length) chat.transcript = transcript;
      return { ...start, chat: { ...chat, draft: f.draft ?? "" }, seconds: Number(f.seconds) || 0 };
    }
    return { ...start, post: { text: f.text ?? "", posted: sent }, seconds: Number(f.seconds) || 0 };
  };

  render = () => {
    this.parseSettings(); // trigger() may have changed them
    const p = this.config.properties;
    render(null, this.shadowdom);
    const css = document.createElement("style");
    css.innerHTML = style;
    this.shadowdom.appendChild(css);
    render(
      <Interaction prompt={p.prompt ?? ""} environment={this.environment} scenario={this.scenario} store={this.store} t={textsFor(p.language)} ui={textsFor(p.language) === textsFor("nl") ? "nl" : "en"}
        lang={this.writingLanguage} spellcheckMode={String(p.spellcheck)} showCount={isTrue(p.showWordCount)} readOnly={this.config.status === "solution"}
        chatDelay={Math.max(0, Number(p.chatDelay) || 0)} seen={this.seen} elapsed={this.elapsed} model={this.config.status === "solution"} />,
      this.shadowdom
    );
    this.seen = this.store.getState().chat.transcript.length; // a later render (trigger) shows them at once
  };

  /**
   * Authoring mode: the author picks the environment and writes the task, the inbox, the chat script or the thread,
   * the limits, a model answer and the checks; getProperties() gives data-environment, data-writing-language and
   * data-scenario. Only an authoring system calls this (AUTHORING.md, "Authoring mode").
   */
  getAuthoringInstance = (dom: HTMLElement, config: PciAuthoringConfiguration<PropTypes>): PciAuthoringInstance => {
    const properties = { ...defaults, ...normalize(config.properties as Record<string, string>) };
    let draft = {
      scenario: parseScenario(properties.scenario),
      environment: (ENVIRONMENTS.includes(properties.environment as Environment) ? properties.environment : "email") as Environment,
      writingLanguage: (WRITING_LANGUAGES.includes(properties.writingLanguage as WritingLanguage) ? properties.writingLanguage : "en") as WritingLanguage,
    };
    const language = (config.language ?? "en").slice(0, 2); // the author's language, not the candidate's
    const shadow = dom.shadowRoot ?? dom.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.innerHTML = style;
    shadow.appendChild(css);
    const host = document.createElement("div");
    shadow.appendChild(host);
    render(
      <Authoring initial={draft} language={language} prompt={String(properties.prompt ?? "")} onChange={(next) => { draft = next; config.onchange?.(); }}
        preview={(el, d) => {
          // the candidate's view of the draft, in an interaction of its own
          const shown = new App(false).getInstance(el, {
            properties: { ...properties, environment: d.environment, writingLanguage: d.writingLanguage, scenario: serializeScenario(d.scenario), language },
            responseIdentifier: "PREVIEW", boundTo: {}, onready: () => { },
          } as unknown as ConfigProperties<PropTypes>, undefined);
          return () => shown.oncompleted();
        }} />,
      host
    );
    const instance: PciAuthoringInstance = {
      getProperties: () => ({ environment: draft.environment, writingLanguage: draft.writingLanguage, scenario: serializeScenario(draft.scenario) }),
      validate: () => authoringProblems(draft, language, String(properties.prompt ?? "")),
      oncompleted: () => render(null, host),
    };
    config.onready?.(instance);
    return instance;
  };

  off = () => { }; // called when setting correct response in tao
  on = (val) => { };

  trigger = (event: string, value: any) => {
    const key = Object.keys(defaults).find((k) => k.toLowerCase() === event.toLowerCase()) ?? event;
    this.config.properties[key] = value;
    window.requestAnimationFrame(() => this.render());
  };

  /** The answer the checks read, from a state. */
  private answerOf = (s: StateModel): Answer => {
    const contacts = this.scenario.contacts;
    if (this.environment === "email") {
      const e = s.email;
      return { environment: "email", to: parseAddresses(e.to, contacts), cc: parseAddresses(e.cc, contacts), subject: e.subject.trim(), attachments: e.attachments, text: e.body, replies: [e.body] };
    }
    if (this.environment === "chat") {
      return chatAnswer(this.scenario.chat, s.chat.transcript);
    }
    return { environment: "post", to: [], cc: [], subject: "", attachments: [], text: s.post.text, replies: [s.post.text] };
  };

  /** Whether the candidate wrote anything (or changed the header) since the item started. */
  private written = (s: StateModel) => {
    const i = this.initialState;
    if (this.environment === "email") {
      const e = s.email, o = i.email;
      return e.to !== o.to || e.cc !== o.cc || e.subject !== o.subject || !!e.body || e.attachments.length > 0 || !!e.sent;
    }
    if (this.environment === "chat") return s.chat.transcript.some((e) => e.me) || !!s.chat.draft.trim();
    return !!s.post.text;
  };

  /** The record for a state: the checks, the message for a rater, the text and its parts, and the metadata. */
  private responseFor = (s: StateModel): QtiVariableJSON => {
    const a = this.answerOf(s);
    const part = this.scenario[this.environment];
    const e = evaluate(part.checks, a, part.limits, this.writingLanguage, this.scenario.contacts);
    const sent = this.environment === "email" ? !!s.email.sent : this.environment === "post" ? !!s.post.posted : s.chat.transcript.some((x) => x.me);
    const record: QtiRecordItem[] = [
      { name: "score", base: { integer: e.score } },
      { name: "maxscore", base: { integer: e.maxscore } },
      { name: "correct", base: { integer: e.correct ? 1 : 0 } },
    ];
    e.results.slice(0, MAX_CHECKS).forEach((r, i) => record.push({ name: `check${i + 1}`, base: { integer: r.passed ? 1 : 0 } }));
    const me = { ...LABELS, me: s.chat.name || this.scenario.me.name || "me" };
    record.push({ name: "environment", base: { string: this.environment } });
    record.push({ name: "message", base: { string: messageText(a, me, { transcript: s.chat.transcript, draft: s.chat.draft, sent }) } });
    record.push({ name: "text", base: { string: a.text } });
    record.push({ name: "html", base: { string: this.environment === "chat" ? a.replies.map(toHtml).join("") : toHtml(a.text) } });
    if (this.environment === "email") {
      record.push({ name: "to", base: { string: a.to.join(", ") } });
      record.push({ name: "cc", base: { string: a.cc.join(", ") } });
      record.push({ name: "subject", base: { string: a.subject } });
      record.push({ name: "attachments", base: { string: a.attachments.join(", ") } });
    }
    if (this.environment === "chat") {
      record.push({ name: "transcript", base: { string: JSON.stringify(s.chat.transcript) } });
      record.push({ name: "draft", base: { string: s.chat.draft } });
      // choice steps (README): the chosen options, their categories, their points, and where the chat is or ended
      const choices = a.choices ?? [];
      record.push({ name: "choices", base: { string: choices.map((c) => c.id).join(",") } });
      record.push({ name: "categories", base: { string: choices.map((c) => c.category).join(",") } });
      record.push({ name: "choicepoints", base: { integer: choices.reduce((sum, c) => sum + c.points, 0) } });
      record.push({ name: "laststep", base: { string: lastStepOf(s.chat) } });
      if (s.chat.name) record.push({ name: "name", base: { string: s.chat.name } });
    }
    record.push({ name: "sent", base: { integer: sent ? 1 : 0 } });
    record.push({ name: "words", base: { integer: countWords(a.text) } });
    record.push({ name: "chars", base: { integer: countChars(a.text) } });
    record.push({ name: "seconds", base: { integer: Math.round(s.seconds) } });
    record.push({ name: "spellcheck", base: { integer: this.config.properties.spellcheck === "on" || (this.config.properties.spellcheck === "toggle" && s.spellcheck) ? 1 : 0 } });
    return { record };
  };

  /**
   * A record with the checks (score, maxscore, correct, check1 …), the message for a rater, the text, its header and
   * the metadata (README). Nothing until the candidate wrote something.
   */
  getResponse = (): QtiVariableJSON | undefined => {
    const s = this.store.getState();
    if (!this.written(s)) return undefined;
    return this.responseFor(s);
  };

  // the store tells the interaction (and the Delivery System) about the reset
  resetResponse = () => {
    this.store.reset();
  };

  /** A response (a record, or the text as a string) back in the environment: its text, header, chat or post. */
  setResponse = (response: QtiVariableJSON) => {
    const fields = fieldsOf(response);
    if (!fields) return;
    if (fields.environment && fields.environment !== this.environment) return; // another environment's answer
    try {
      const next = this.stateFromFields(fields);
      this.store.restoreState({ ...next, email: { ...next.email, read: this.store.getState().email.read } }, []);
      this.baseSeconds = Math.max(this.baseSeconds, next.seconds);
    } catch {
      console.error("couldn't restore the response");
      this.resetResponse();
    }
  };

  oncompleted = () => {
    this.store.unsubscribeAll();
    render(null, this.shadowdom);
  };

  getState = () =>
    JSON.stringify({
      state: this.store.getState(),
      log: this.store.getActions().slice(-50),
    });
}

export default new App();
