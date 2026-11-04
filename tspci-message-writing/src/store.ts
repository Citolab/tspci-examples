import { Store } from "@citolab/preact-store";
import type { ChatEntry } from "./message";

/** The mail the candidate writes, and where they are in the mailbox. */
export type EmailState = {
  /** "inbox" (nothing open), "mail:<id>", "compose" (the draft) or "sent" */
  view: string;
  /** the mails the candidate opened */
  read: string[];
  /** the mail they reply to (its quote shows under the draft) */
  replyTo: string | null;
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: string[];
  /** when they pressed Send (local time, ISO), or null */
  sent: string | null;
};
/** The chat (message.ts ChatState) and the text typed but not sent; `at` and `name` are missing in older states. */
export type ChatModel = { transcript: ChatEntry[]; waiting: string | null; ended: boolean; at?: string | null; name?: string; draft: string };
export type PostModel = { text: string; posted: string | null };

export type StateModel = {
  email: EmailState;
  chat: ChatModel;
  post: PostModel;
  spellcheck: boolean;
  /** seconds spent until the last change, over every session */
  seconds: number;
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  EMAIL: Partial<EmailState> & { seconds?: number };
  CHAT: Partial<ChatModel> & { seconds?: number };
  POST: Partial<PostModel> & { seconds?: number };
  SPELLCHECK: { on: boolean };
};

const withSeconds = (state: StateModel, seconds?: number) => (seconds === undefined ? state.seconds : Math.max(state.seconds, seconds));

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("EMAIL", (state, { seconds, ...patch }) => ({ ...state, email: { ...state.email, ...patch }, seconds: withSeconds(state, seconds) }));
  store.addReducer("CHAT", (state, { seconds, ...patch }) => ({ ...state, chat: { ...state.chat, ...patch }, seconds: withSeconds(state, seconds) }));
  store.addReducer("POST", (state, { seconds, ...patch }) => ({ ...state, post: { ...state.post, ...patch }, seconds: withSeconds(state, seconds) }));
  store.addReducer("SPELLCHECK", (state, { on }) => ({ ...state, spellcheck: on }));
  return store;
};
