import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";
import { CHOICE_CHAT } from "./message";

const meta = {
  title: "Message writing",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Rec = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;
/** A field of the record response. */
const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
const record = (fields: Record<string, string | number>) => ({
  record: Object.entries(fields).map(([name, v]) => ({ name, base: typeof v === "number" ? { integer: v } : { string: v } })),
});

/** Puts text in a text box at once, as pasting does (userEvent.paste looks for the focus outside the shadow root). */
const fill = (box: HTMLElement, text: string) => {
  (box as HTMLTextAreaElement).value = text;
  box.dispatchEvent(new Event("input", { bubbles: true }));
};
/** A key on an element in the shadow root (userEvent.keyboard sends keys to document.activeElement, the host). */
const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

const BODY =
  "Dear Lotte,\n\nThank you for your email. We are coming with 24 students and two teachers. We will arrive on Monday 2 November at about eleven o'clock in the morning.\n\nI have added the list of dietary needs. Can we rent bikes at the campsite? We would like to cycle to the lake.\n\nKind regards,\nSam";

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("heading", { name: "Task" })).toBeInTheDocument();
    expect(canvas.getByTestId("prompt")).toHaveTextContent(/^Your class is going on a trip/);
    expect(canvas.getByRole("navigation", { name: "Mailbox" })).toBeInTheDocument();
    expect(canvas.getByRole("list", { name: /Inbox/ }).querySelectorAll("li")).toHaveLength(2);
    expect(canvas.getByRole("button", { name: /Lotte Bakker.*unread/ })).toBeInTheDocument();
    expect(canvas.getByText("2 unread")).toBeInTheDocument();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const ReplyToAnEmail: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("open the mail and its attachment", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Lotte Bakker/ }));
      expect(canvas.getByRole("article", { name: "Your booking for the class trip" })).toBeInTheDocument();
      expect(canvas.getByText("1 unread")).toBeInTheDocument();
      await userEvent.click(canvas.getByRole("button", { name: "Preview campsite-map.svg" }));
      expect(canvas.getByRole("img", { name: "campsite-map.svg" })).toBeVisible();
      expect(canvas.getByRole("status")).toHaveTextContent("Opened: Your booking for the class trip.");
    });

    await step("reply: To and Subject are filled in", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Reply" }));
      expect(canvas.getByRole("combobox", { name: "To" })).toHaveValue("lotte@greenvalley.example");
      expect(canvas.getByRole("textbox", { name: "Subject" })).toHaveValue("Re: Your booking for the class trip");
      expect(canvas.getByRole("status")).toHaveTextContent("Reply to Lotte Bakker.");
    });

    await step("Cc by name, an attachment, the text", async () => {
      await userEvent.type(canvas.getByRole("combobox", { name: "Cc" }), "Mr Visser");
      await userEvent.click(canvas.getByRole("button", { name: /Attach a file/ }));
      await userEvent.click(canvas.getByRole("checkbox", { name: /dietary-needs\.pdf/ }));
      await userEvent.click(canvas.getByRole("button", { name: "Done" }));
      expect(canvas.getByRole("button", { name: "Remove dietary-needs.pdf" })).toBeInTheDocument();
      const body = canvas.getByRole("textbox", { name: "Message" });
      fill(body, BODY);
      await waitFor(() => expect(canvas.getByTestId("words")).toHaveTextContent("56 words"));
      expect(canvas.queryByTestId("limit-note")).toBeNull();
    });

    await step("the response: every check passes, not sent yet", async () => {
      const r = await lastChange(mounted);
      expect(field(r, "score")).toEqual({ integer: 7 });
      expect(field(r, "maxscore")).toEqual({ integer: 7 });
      expect(field(r, "cc")).toEqual({ string: "visser@school.example" });
      expect(field(r, "attachments")).toEqual({ string: "dietary-needs.pdf" });
      expect(field(r, "sent")).toEqual({ integer: 0 });
    });

    await step("send", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Send$/ }));
      expect(canvas.getByRole("article", { name: "Re: Your booking for the class trip" })).toBeInTheDocument();
      expect(canvas.getByRole("status")).toHaveTextContent("Your message has been sent.");
      const r = pci.getResponse();
      expect(field(r, "sent")).toEqual({ integer: 1 });
      expect(field(r, "message")?.string).toMatch(/^To: lotte@greenvalley\.example\nCc: visser@school\.example\nSubject: Re: Your booking/);
      await userEvent.click(canvas.getByRole("button", { name: "Edit the message" }));
      expect(canvas.getByRole("textbox", { name: "Message" })).toHaveValue(BODY);
    });
  },
};

export const Formatting: Story = {
  args: { properties: { scenario: JSON.stringify({ email: { inbox: [], files: [], start: "new", task: "Write to your friend." } }) } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const body = canvas.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;

    await step("starts with a new message; no recipient: Send says so", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Send$/ }));
      expect(canvas.getByRole("status")).toHaveTextContent("Add a recipient (To) first.");
    });

    await step("Ctrl+B bolds the selection, the toolbar makes a list", async () => {
      await userEvent.type(body, "Hi there");
      body.setSelectionRange(3, 8);
      await userEvent.keyboard("{Control>}b{/Control}");
      expect(body).toHaveValue("Hi **there**");
      body.setSelectionRange(0, 0);
      await userEvent.click(canvas.getByRole("button", { name: "List" }));
      await waitFor(() => expect(body).toHaveValue("- Hi **there**"));
    });

    await step("the preview shows the formatting; the response has it as html", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Preview" }));
      const preview = canvas.getByRole("region", { name: "Preview of your message" });
      expect(preview.querySelector("li strong")).toHaveTextContent("there");
      expect(field(pci.getResponse(), "html")).toEqual({ string: "<ul><li>Hi <strong>there</strong></li></ul>" });
      expect(field(pci.getResponse(), "words")).toEqual({ integer: 2 });
    });

    await step("the arrow keys move in the toolbar", async () => {
      const bold = canvas.getByRole("button", { name: "Bold" });
      bold.focus();
      // the focus in the shadow root the toolbar is in (or the document, for a PCI without one)
      const focused = () => {
        const root = bold.getRootNode();
        return root instanceof ShadowRoot || root instanceof Document ? root.activeElement : null;
      };
      key(bold, "ArrowRight");
      expect(focused()).toBe(canvas.getByRole("button", { name: "Italic" }));
      key(canvas.getByRole("button", { name: "Italic" }), "End");
      expect(focused()).toBe(canvas.getByRole("button", { name: "Preview" }));
    });
  },
};

export const Chat: Story = {
  args: { properties: { environment: "chat", chatDelay: "30" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const log = canvas.getByRole("log", { name: "Messages" });
    const box = () => canvas.getByRole("textbox", { name: "Write a message" });

    await step("the first messages arrive", async () => {
      await waitFor(() => expect(log.querySelectorAll("li")).toHaveLength(2));
      expect(canvas.getByRole("heading", { name: "Class 3B" })).toBeInTheDocument();
    });

    await step("a reply without a keyword: the script asks again", async () => {
      await userEvent.type(box(), "Hi! Yes sure{Enter}");
      await waitFor(() => expect(log.querySelectorAll("li")).toHaveLength(4));
      expect(log).toHaveTextContent("Sorry, I don't get it");
    });

    await step("snacks: the snacks branch", async () => {
      await userEvent.type(box(), "I will bring a cake{Enter}");
      await waitFor(() => expect(log).toHaveTextContent("What kind of snacks"));
      await userEvent.type(box(), "Chocolate cake{Shift>}{Enter}{/Shift}and cookies{Enter}");
      await waitFor(() => expect(log).toHaveTextContent("What do you want to write in it"));
      await userEvent.type(box(), "Thanks for everything, we will miss you!{Enter}");
    });

    await step("the response: the replies, the transcript, the checks", async () => {
      await waitFor(() => expect(field(pci.getResponse(), "score")).toEqual({ integer: 3 }));
      const r = pci.getResponse();
      expect(field(r, "text")?.string).toBe("Hi! Yes sure\n\nI will bring a cake\n\nChocolate cake\nand cookies\n\nThanks for everything, we will miss you!");
      expect(JSON.parse(field(r, "transcript")!.string!)).toHaveLength(9);
      expect(field(r, "message")?.string).toMatch(/\] Daan: Can you bring something\? Drinks or snacks\?\n\[\d\d:\d\d\] Sam Jansen: Hi! Yes sure/);
    });
  },
};

export const ForumPost: Story = {
  args: { properties: { environment: "post", spellcheck: "on" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const box = canvas.getByRole("textbox", { name: "Your reply" });
    expect(box).toHaveAttribute("spellcheck", "true");
    expect(box).toHaveAttribute("lang", "en");
    expect(canvas.queryByRole("button", { name: /Spellcheck/ })).toBeNull();
    expect(canvas.getAllByRole("article")).toHaveLength(2);

    await step("over the character limit: Post is disabled and the count says so", async () => {
      fill(box, "a".repeat(405));
      await waitFor(() => expect(canvas.getByTestId("chars")).toHaveTextContent("405 of 400 characters"));
      expect(canvas.getByTestId("chars")).toHaveTextContent("405 of 400 characters");
      expect(canvas.getByTestId("limit-note")).toHaveTextContent("5 characters too many");
      expect(canvas.getByRole("button", { name: "Post" })).toBeDisabled();
    });

    await step("a reply within the limit is posted", async () => {
      fill(box, "Hi Bo! Read Holes by Louis Sachar, because it is an adventure about friendship with a really surprising end.");
      await userEvent.click(canvas.getByRole("button", { name: "Post" }));
      expect(canvas.getByTestId("own-post")).toHaveTextContent("Sam Jansen");
      const r = await lastChange(mounted);
      expect(field(r, "sent")).toEqual({ integer: 1 });
      expect(field(r, "score")).toEqual({ integer: 2 });
      expect(field(pci.getResponse(), "spellcheck")).toEqual({ integer: 1 });
    });
  },
};

export const SpellcheckToggle: Story = {
  args: { properties: { environment: "post", writingLanguage: "de" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    const box = canvas.getByRole("textbox", { name: "Your reply" });
    expect(box).toHaveAttribute("lang", "de");
    expect(box).toHaveAttribute("spellcheck", "false");
    await userEvent.click(canvas.getByRole("button", { name: /Spellcheck/ }));
    expect(canvas.getByRole("button", { name: /Spellcheck/ })).toHaveAttribute("aria-pressed", "true");
    expect(box).toHaveAttribute("spellcheck", "true");
    expect(canvas.getByRole("status")).toHaveTextContent("Spellcheck on");
  },
};

/** An own scenario: a German reply, a word range, greeting and closing from a list, phrases, no word count shown. */
const german = JSON.stringify({
  me: { name: "Sam", address: "sam@schule.example" },
  email: {
    task: "Antworte Frau Weber.",
    start: "reply:w1",
    inbox: [{ id: "w1", from: { name: "Frau Weber", address: "weber@hotel.example" }, subject: "Ihre Anfrage", date: "2026-05-04T08:00", body: "Guten Tag,\nwann kommen Sie an?" }],
    files: [],
    limits: { minWords: 5, maxWords: 30 },
    checks: [{ type: "subject" }, { type: "words" }, { type: "greeting" }, { type: "closing", phrases: ["Mit freundlichen Grüßen"] }, { type: "phrases", phrases: ["Montag"], points: 2 }],
  },
});

export const OwnScenarioGerman: Story = {
  args: { properties: { scenario: german, writingLanguage: "de", showWordCount: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Subject" })).toHaveValue("Re: Ihre Anfrage");
    expect(canvas.getByText("Write 5 to 30 words.")).toBeInTheDocument();
    expect(canvas.queryByTestId("words")).toBeNull();
    const body = canvas.getByRole("textbox", { name: "Message" });
    expect(body).toHaveAttribute("lang", "de");
    fill(body, "Sehr geehrte Frau Weber,\nwir kommen am montag um zehn Uhr.\nMit freundlichen Grüßen\nSam");
    const r = pci.getResponse();
    expect([1, 2, 3, 4, 5].map((i) => field(r, `check${i}`)?.integer)).toEqual([1, 1, 1, 1, 1]);
    expect(field(r, "score")).toEqual({ integer: 6 });
    expect(field(r, "correct")).toEqual({ integer: 1 });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", environment: "chat", chatDelay: "0" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("heading", { name: "Opdracht" })).toBeInTheDocument();
    expect(canvas.getByRole("log", { name: "Berichten" })).toBeInTheDocument();
    const box = canvas.getByRole("textbox", { name: "Typ een bericht" });
    expect(canvas.getByText("Enter verstuurt, Shift + Enter begint een nieuwe regel.")).toBeInTheDocument();
    await userEvent.type(box, "Ik neem drinken mee, drinks!{Enter}");
    expect(canvas.getByRole("status")).toHaveTextContent("Bericht verstuurd.");
    expect(canvas.getByTestId("words")).toHaveTextContent("5 woorden");
    // the response does not depend on the language of the screens
    expect(field(pci.getResponse(), "message")?.string).toContain("Sam Jansen: Ik neem drinken mee");
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: /Lotte Bakker/ }));
    await userEvent.click(first.canvas.getByRole("button", { name: "Reply" }));
    await userEvent.type(first.canvas.getByRole("textbox", { name: "Message" }), "Dear Lotte, we are 24.");
    const state = first.pci.getState();
    expect(JSON.parse(state).state.email.body).toBe("Dear Lotte, we are 24.");

    const second = await remountPci(canvasElement, pci, { state });
    expect(second.canvas.getByRole("textbox", { name: "Message" })).toHaveValue("Dear Lotte, we are 24.");
    expect(second.canvas.getByText("1 unread")).toBeInTheDocument();
    expect(field(second.pci.getResponse(), "text")).toEqual(field(first.pci.getResponse(), "text"));
    expect(second.changes).toHaveLength(0);
  },
};

export const RestoresChat: Story = {
  args: { properties: { environment: "chat", chatDelay: "0" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(first.canvas.getByRole("textbox", { name: "Write a message" }), "Drinks!{Enter}");
    await waitFor(() => expect(first.canvas.getAllByTestId("chat-message")).toHaveLength(4));
    await userEvent.type(first.canvas.getByRole("textbox", { name: "Write a message" }), "half a sentence");
    const second = await remountPci(canvasElement, pci, { properties: { environment: "chat", chatDelay: "5000" }, state: first.pci.getState() });
    // seen before: no waiting for them again
    expect(second.canvas.getAllByTestId("chat-message")).toHaveLength(4);
    expect(second.canvas.getByRole("textbox", { name: "Write a message" })).toHaveValue("half a sentence");
    expect(field(second.pci.getResponse(), "draft")).toEqual({ string: "half a sentence" });
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: record({ environment: "email", to: "lotte@greenvalley.example", subject: "Our trip", text: "Dear Lotte, hello.", attachments: "class-photo.jpg", sent: 1 }) } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is the sent message", async () => {
      expect(canvas.getByRole("article", { name: "Our trip" })).toHaveTextContent("Dear Lotte, hello.");
      expect(field(pci.getResponse(), "check3")).toEqual({ integer: 0 });
      expect(field(pci.getResponse(), "check1")).toEqual({ integer: 1 });
    });
    await step("resetResponse: as the item starts", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByText("Choose a message in the inbox, or write a new one.")).toBeInTheDocument());
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { email: { view: "compose", body: "mine" } }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's model answer, read-only
    expect(canvas.getByRole("heading", { name: "Task · Model answer" })).toBeInTheDocument();
    const article = canvas.getByRole("article", { name: "Re: Your booking for the class trip" });
    expect(article.querySelector("strong")).toHaveTextContent("24 students");
    expect(canvas.queryByRole("textbox")).toBeNull();
    expect(canvas.queryByRole("button", { name: /Send/ })).toBeNull();
    expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 });
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: {
    status: "solution",
    properties: { environment: "post" },
    responseDeclaration: { cardinality: "record", correctResponse: { value: [{ fieldIdentifier: "text", value: "Read **Momo**, because it is magic." }, { fieldIdentifier: "sent", value: "1" }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByTestId("own-post")).toHaveTextContent("Read Momo, because it is magic.");
    expect(canvas.getByTestId("own-post").querySelector("strong")).toHaveTextContent("Momo");
  },
};

/** Two interactions of this type on one page: each has its own mail and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, args));
      page.appendChild(slot);
    }
    return page;
  },
  args: { properties: { environment: "post" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await userEvent.type(first.canvas.getByRole("textbox", { name: "Your reply" }), "One");
    await userEvent.type(second.canvas.getByRole("textbox", { name: "Your reply" }), "Two words");
    expect(field(first.pci.getResponse(), "text")).toEqual({ string: "One" });
    expect(field(second.pci.getResponse(), "words")).toEqual({ integer: 2 });
    expect(first.changes).toHaveLength(3);
    expect(second.changes).toHaveLength(9);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const scenario = () => JSON.parse(instance.getProperties().scenario!);

    await step("starts from the example; its model answer passes every check", async () => {
      expect(instance.validate()).toEqual([]);
      await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
      expect(canvas.getByTestId("summary")).toHaveTextContent("The model answer scores 7 of 7.");
    });

    await step("a check the model answer fails is a problem", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a check" }));
      await userEvent.selectOptions(canvas.getByTestId("check-7-type"), "Words or phrases present");
      expect(instance.validate()).toContain("Check 8 has no words or phrases.");
      await userEvent.type(canvas.getByTestId("check-7-phrases"), "tent*");
      expect(instance.validate()).toEqual(["The model answer does not pass check 8."]);
      expect(scenario().email.checks[7]).toEqual({ type: "phrases", phrases: ["tent*"], points: 1 });
      expect(canvas.getByTestId("check-7-model")).toHaveTextContent("the model answer fails");
      await userEvent.click(canvas.getByRole("button", { name: "Remove: 8. Words or phrases present" }));
      expect(instance.validate()).toEqual([]);
    });

    await step("the task tab: the environment, the limits, the task", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Task" }));
      await userEvent.click(canvas.getByRole("radio", { name: /Chat app/ }));
      expect(instance.getProperties().environment).toBe("chat");
      await userEvent.type(canvas.getByTestId("maxChars"), "500");
      expect(scenario().chat.limits).toEqual({ maxChars: 500 });
      await userEvent.selectOptions(canvas.getByTestId("writing-language"), "fr");
      expect(instance.getProperties().writingLanguage).toBe("fr");
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("the chat script: a branch to a step that does not exist", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Content" }));
      await userEvent.type(canvas.getByTestId("step-4-branches"), "card* -> party");
      expect(instance.validate()).toEqual(["Step card goes on to party, which does not exist."]);
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a step" }));
      expect(instance.validate()).toContain("Step s6 has no messages.");
    });

    await step("the preview shows the candidate's view", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Preview" }));
      const pane = canvas.getByTestId("preview-pane");
      await waitFor(() => expect(pane.shadowRoot?.querySelector("[data-testid=chat]")).toBeTruthy());
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { environment: "post", scenario: JSON.stringify({ post: { platform: "social", posts: [], model: "Hoi" } }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Opdracht" })).toHaveAttribute("aria-selected", "true");
    expect(instance.validate()).toEqual(["Er is geen opdracht voor de kandidaat."]);
    await userEvent.type(canvas.getByTestId("task"), "Reageer op het bericht.");
    expect(instance.validate()).toEqual([]);
    // the tabs work with the arrow keys
    canvas.getByRole("tab", { name: "Opdracht" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(canvas.getByRole("tab", { name: "Inhoud" })).toHaveAttribute("aria-selected", "true");
    expect(JSON.parse(instance.getProperties().scenario!).post.task).toBe("Reageer op het bericht.");
  },
};

// --- Chat with reply buttons (choice steps), a name step, a document card and notices (inspired by the DEPP ChatBot PCI)

const CHOICES = JSON.stringify({ chat: CHOICE_CHAT });

export const ChatChoices: Story = {
  args: { properties: { environment: "chat", chatDelay: "20", scenario: CHOICES } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const log = canvas.getByRole("log", { name: "Messages" });

    await step("a notice, then the name step: the candidate types their name", async () => {
      await waitFor(() => expect(log.querySelectorAll("li")).toHaveLength(2));
      expect(log.querySelector("[data-kind=system]")).toHaveTextContent("Notice: Mila added you to the chat.");
      await userEvent.type(canvas.getByRole("textbox", { name: "Type your name" }), "Lena de Vries{Enter}");
    });

    await step("{firstName} is filled in; a document card; reply buttons instead of the text box", async () => {
      await waitFor(() => expect(canvas.getByRole("group", { name: "Choose your reply." })).toBeInTheDocument());
      expect(log).toHaveTextContent("Nice to meet you, Lena!");
      expect(canvas.getByTestId("chat-card")).toHaveTextContent("Document: Training schedule");
      expect(canvas.getByTestId("chat-card")).toHaveTextContent("Thursday 18:00–19:30, field 1");
      expect(canvas.queryByRole("textbox")).toBeNull();
      const buttons = canvas.getAllByRole("button").filter((b) => b.dataset.option);
      expect(buttons.map((b) => b.dataset.option)).toEqual(["yes", "thursday", "maybe", "whatever"]);
      // real buttons (type="button"): in the tab order, Enter and Space press them
      buttons[1].focus();
      expect(buttons[1].tagName).toBe("BUTTON");
      await userEvent.click(buttons[1]);
      expect(canvas.getByRole("status")).toHaveTextContent("You replied: Sorry, I can't on Tuesday. Is Thursday OK?");
    });

    await step("the choice in the response: id, category, points, the step", async () => {
      await waitFor(() => expect(log).toHaveTextContent("Do you have a question about the training, Lena?"));
      const r = pci.getResponse();
      expect(field(r, "choices")).toEqual({ string: "thursday" });
      expect(field(r, "categories")).toEqual({ string: "polite" });
      expect(field(r, "choicepoints")).toEqual({ integer: 2 });
      expect(field(r, "laststep")).toEqual({ string: "thursday" });
      expect(field(r, "name")).toEqual({ string: "Lena de Vries" });
      // written replies only: the name and the button are not text
      expect(field(r, "text")).toEqual({ string: "" });
    });

    await step("a written step after the choice; the chat ends", async () => {
      await userEvent.type(canvas.getByRole("textbox", { name: "Write a message" }), "What should I wear?{Enter}");
      await waitFor(() => expect(log).toHaveTextContent("This chat has ended."));
      const r = pci.getResponse();
      expect(field(r, "laststep")).toEqual({ string: "bye" });
      expect(field(r, "score")).toEqual({ integer: 3 });
      expect(field(r, "text")).toEqual({ string: "What should I wear?" });
      expect(field(r, "message")?.string).toMatch(/Lena de Vries: Sorry, I can't on Tuesday\. Is Thursday OK\? \(thursday\)/);
      expect(field(r, "message")?.string).toMatch(/Mila: \[Training schedule\] Tuesday/);
    });
  },
};

export const ChatChoicesDutch: Story = {
  args: { properties: { language: "nl", environment: "chat", chatDelay: "0", scenario: CHOICES } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Typ je naam" }), "Daan{Enter}");
    const group = await waitFor(() => canvas.getByRole("group", { name: "Kies je antwoord." }));
    expect(canvas.getByTestId("chat-card")).toHaveTextContent("Document: Training schedule");
    await userEvent.click(group.querySelector<HTMLElement>("[data-option=whatever]")!);
    expect(canvas.getByRole("status")).toHaveTextContent("Je antwoordde: Whatever.");
    const r = pci.getResponse();
    expect(field(r, "categories")).toEqual({ string: "rude" });
    expect(field(r, "choicepoints")).toEqual({ integer: 0 });
    expect(field(r, "check2")).toEqual({ integer: 0 });
  },
};

export const RestoresChoiceChat: Story = {
  args: { properties: { environment: "chat", chatDelay: "0", scenario: CHOICES } },
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(first.canvas.getByRole("textbox", { name: "Type your name" }), "Lena{Enter}");
    await userEvent.click(await waitFor(() => first.canvas.getByRole("button", { name: "Maybe." })));
    const response = first.pci.getResponse();
    await waitFor(() => expect(first.canvas.getByRole("log")).toHaveTextContent("Do you have a question"));
    const count = first.canvas.getAllByTestId("chat-message").length;
    expect(count).toBe(8);

    await step("from the state: the same chat, no waiting", async () => {
      const second = await remountPci(canvasElement, pci, { properties: { environment: "chat", chatDelay: "5000", scenario: CHOICES }, state: first.pci.getState() });
      expect(second.canvas.getAllByTestId("chat-message")).toHaveLength(count);
      expect(field(second.pci.getResponse(), "choices")).toEqual({ string: "maybe" });
      expect(field(second.pci.getResponse(), "name")).toEqual({ string: "Lena" });
      expect(second.changes).toHaveLength(0);
    });

    await step("from the response (boundTo): the transcript is answered by the script again", async () => {
      const third = await remountPci(canvasElement, pci, { properties: { environment: "chat", chatDelay: "0", scenario: CHOICES }, boundTo: { RESPONSE: response } });
      const r = third.pci.getResponse();
      expect(field(r, "choices")).toEqual({ string: "maybe" });
      expect(field(r, "laststep")).toEqual({ string: "question" });
      expect(third.canvas.getByRole("textbox", { name: "Write a message" })).toBeInTheDocument();
    });
  },
};

export const ChatChoicesSolution: Story = {
  args: { status: "solution", properties: { environment: "chat", chatDelay: "0", scenario: CHOICES } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the model answer: "Sam", the button "yes", a question; read-only, no buttons
    expect(canvas.getByRole("log", { name: "Messages" })).toHaveTextContent("Yes, I'll be there. Thank you!");
    expect(canvas.queryByRole("group", { name: "Choose your reply." })).toBeNull();
    expect(canvas.queryByRole("textbox")).toBeNull();
    const r = pci.getResponse();
    expect(field(r, "choices")).toEqual({ string: "yes" });
    expect(field(r, "correct")).toEqual({ integer: 1 });
  },
};

export const AuthoringChoices: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { environment: "chat", scenario: CHOICES } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    const scenario = () => JSON.parse(instance.getProperties().scenario!);

    await step("the mixed scenario is valid; its model answer passes the choices checks", async () => {
      expect(instance.validate()).toEqual([]);
      await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
      expect(canvas.getByTestId("summary")).toHaveTextContent("The model answer scores 3 of 3.");
      expect(canvas.getByTestId("check-1-category")).toHaveValue("rude");
    });

    await step("reply buttons, the name step and the points per category in the content tab", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Content" }));
      expect(canvas.getByTestId("step-0-ask-name")).toBeChecked();
      expect(canvas.getByTestId("step-1-messages")).toHaveValue(
        "Mila: Nice to meet you, {firstName}! Here is the training schedule.\nMila: # Training schedule | Tuesday 18:00–19:30, field 2\\nThursday 18:00–19:30, field 1\\nBring a stick, shin guards and a water bottle.\nMila: Can you come on Tuesday?"
      );
      expect(canvas.getByTestId("step-1-options")).toHaveValue(
        "yes: Yes, I'll be there. Thank you! | polite | question\nthursday: Sorry, I can't on Tuesday. Is Thursday OK? | polite | thursday\nmaybe: Maybe. | neutral | question\nwhatever: Whatever. | rude | question"
      );
      fill(canvas.getByTestId("step-1-options"), "yes: Yes! | polite | nowhere");
      expect(instance.validate()).toEqual(expect.arrayContaining(["Step schedule needs 2 to 4 reply buttons.", "Step schedule goes on to nowhere, which does not exist.", "Check 2 counts the category rude, which no reply button has."]));
      fill(canvas.getByTestId("step-1-options"), "yes: Yes! | polite | question | 3\nno: No. | rude");
      expect(scenario().chat.steps[1].options).toEqual([{ id: "yes", text: "Yes!", category: "polite", next: "question", points: 3 }, { id: "no", text: "No.", category: "rude" }]);
      expect(instance.validate()).toEqual([]);
      fill(canvas.getByTestId("category-points"), "polite: 4\nrude: -1");
      expect(scenario().chat.categoryPoints).toEqual({ polite: 4, rude: -1 });
      await userEvent.click(canvas.getByTestId("step-1-ask-name"));
      expect(instance.validate()).toContain("Step schedule asks for the name and has reply buttons: choose one.");
      await userEvent.click(canvas.getByTestId("step-1-ask-name"));
      fill(canvas.getByTestId("step-2-messages"), "= Mila is away.\n# | no title");
      expect(scenario().chat.steps[2].messages).toEqual([{ from: "", kind: "system", text: "Mila is away." }, { from: "", kind: "card", title: "", text: "no title" }]);
      expect(instance.validate()).toContain("Step thursday has a document card without a title.");
    });
  },
};
