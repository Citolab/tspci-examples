import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Brainstorm",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** The messages in the chat as a screen reader reads them: "name: message". */
const messages = (root: ShadowRoot | HTMLElement) => [...root.querySelectorAll('[role="log"] li p')].map((p) => p.textContent);

const response = (pci: MountedPci["pci"]) => (pci.getResponse() as { base: { string: string } } | undefined)?.base.string;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The candidate types a message and sends it with Enter. (Harness limitation: user-event never sees the input in the
 * shadow root get focus, so it does not notice the PCI emptying it after a message, and would type after the previous
 * one. So the text is put in the input with an input event.) It is sent with the send button: a key press would make
 * the bots wait.
 */
const say = async (input: HTMLElement, text: string) => {
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.input(input, { target: { value: text } });
  const send = input.closest("form")!.querySelector<HTMLElement>('button[type="submit"]')!;
  await waitFor(() => expect(send).toBeEnabled());
  await userEvent.click(send);
};

/** A script without a start message: the brainstorm starts right away, and no bot speaks within the story. */
const QUIET = { startText: "", messages: "600;Anne;red;Much later" };

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("waits behind the start message: nothing to type yet, no response", async () => {
      expect(canvas.getByRole("button", { name: "Click here when you are ready to brainstorm" })).toBeInTheDocument();
      expect(canvas.getByRole("textbox", { name: "Your message (You)" })).toBeDisabled();
      expect(canvas.getByRole("progressbar", { name: "Time left" })).toHaveAttribute("aria-valuenow", "100");
      expect(canvas.getByRole("progressbar", { name: "Time left" })).toHaveAttribute("aria-valuetext", "60 seconds left");
      expect(canvas.getByRole("log")).toBeEmptyDOMElement();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the candidate starts and sends an idea: it is the response", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Click here when you are ready to brainstorm" }));
      const input = canvas.getByRole("textbox", { name: "Your message (You)" });
      await waitFor(() => expect(input).toBeEnabled());
      expect(canvas.queryByRole("button", { name: "Click here when you are ready to brainstorm" })).toBeNull();
      await userEvent.type(input, "A film about vikings{Enter}");
      await waitFor(() => expect(messages(mounted.root)).toEqual(["You: A film about vikings"]));
      expect(input).toHaveValue("");
      expect(response(pci)).toMatch(/^\|00:0\d;You;A film about vikings$/);
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("an empty message is not sent", async () => {
      const input = canvas.getByRole("textbox", { name: "Your message (You)" });
      fireEvent.input(input, { target: { value: "   " } });
      await waitFor(() => expect(canvas.getByRole("button", { name: "Send" })).toBeDisabled());
      await userEvent.type(input, "{Enter}");
      expect(messages(mounted.root)).toHaveLength(1);
    });

    await step("the send button sends; ; and | are kept out of the response format", async () => {
      const input = canvas.getByRole("textbox", { name: "Your message (You)" });
      fireEvent.input(input, { target: { value: "  axes; shields | helmets " } });
      await userEvent.click(canvas.getByRole("button", { name: "Send" }));
      await waitFor(() => expect(messages(mounted.root)).toHaveLength(2));
      expect(messages(mounted.root)[1]).toBe("You: axes; shields | helmets");
      expect(response(pci)).toMatch(/^\|00:0\d;You;A film about vikings\|00:0\d;You;axes, shields \/ helmets$/);
    });
  },
};

export const Bots: Story = {
  args: { properties: { startText: "", messages: "1;Lars;green;Second\n0;Anne;#00a8a7;First; with a semicolon\nnot a message\nx;Igor;red;No delay" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    // no start message: it starts right away
    expect(canvas.queryByRole("button", { name: /ready/ })).toBeNull();
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "Your message (You)" })).toBeEnabled());

    // the bots speak in the order of their time; a line that is not "seconds;name;colour;message" is skipped
    await waitFor(() => expect(messages(root)).toEqual(["Anne: First; with a semicolon"]));
    expect(await canvas.findByText("Lars is typing…")).toBeInTheDocument();
    await waitFor(() => expect(messages(root)).toEqual(["Anne: First; with a semicolon", "Lars: Second"]), { timeout: 3000 });
    expect(canvas.getByText("Anne")).toHaveStyle({ color: "rgb(0, 168, 167)" });
    // a bot's message is stamped with its scripted time
    expect(response(pci)).toBe("|00:00;Anne;First, with a semicolon|00:01;Lars;Second");
    // (Anne's message at 0 s came during getInstance, before the PCI tells the player about changes: one event, Lars's)
    expect(await lastChange(mounted)).toEqual({ base: { string: "|00:00;Anne;First, with a semicolon|00:01;Lars;Second" } });
  },
};

export const BotsWaitWhileTyping: Story = {
  args: { properties: { startText: "", messages: "1;Anne;red;I waited" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Your message (You)" });
    await waitFor(() => expect(input).toBeEnabled());
    // a key press: the bots' clock stops until 3 s after it
    await userEvent.type(input, "h");
    expect(input).toHaveValue("h");
    await sleep(2000);
    expect(messages(root)).toEqual([]);
    expect(canvas.queryByText("Anne is typing…")).toBeNull();
    await waitFor(() => expect(messages(root)).toEqual(["Anne: I waited"]), { timeout: 4000 });
  },
};

export const TimeIsUp: Story = {
  args: { properties: { startText: "", timeLimit: "2", messages: "1;Anne;red;In time\n5;Lars;green;Too late" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    const input = canvas.getByRole("textbox", { name: "Your message (You)" });
    await say(input, "Quick idea");
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("Time is up. Go to next task."), { timeout: 4000 });
    expect(input).toBeDisabled();
    expect(canvas.getByRole("progressbar", { name: "Time left" })).toHaveAttribute("aria-valuenow", "0");
    // the bot that had not spoken yet stays silent
    expect(messages(root)).toEqual(["You: Quick idea", "Anne: In time"]);
    expect(response(pci)).toMatch(/^\|00:00;You;Quick idea\|00:01;Anne;In time$/);
  },
};

export const DutchNickname: Story = {
  args: { properties: { ...QUIET, language: "nl", nickname: "Ik", endText: "" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Je bericht (Ik)" });
    expect(input).toHaveAttribute("placeholder", "Typ een idee en druk op Enter");
    expect(canvas.getByRole("progressbar", { name: "Resterende tijd" })).toHaveAttribute("aria-valuetext", "nog 60 seconden");
    await say(input, "Een museum");
    await waitFor(() => expect(messages(root)).toEqual(["Ik: Een museum"]));
    expect(response(pci)).toMatch(/^\|00:0\d;Ik;Een museum$/);
    expect(canvas.getByRole("button", { name: "Verstuur" })).toBeDisabled();
  },
};

export const DefaultEndText: Story = {
  // without an end message of its own the PCI's own text appears
  args: { properties: { ...QUIET, timeLimit: "1", endText: "", language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("De brainstorm is afgelopen."), { timeout: 3000 });
  },
};

const FINISHED = "|00:05;Anne;Axes|00:07;You;A museum|00:10;Lars;Ships";

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: { base: { string: FINISHED } } }, properties: { messages: "5;Anne;darkred;Axes" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    await waitFor(() => expect(messages(root)).toEqual(["Anne: Axes", "You: A museum", "Lars: Ships"]));
    // the candidate's own messages are the ones with the nickname; a bot gets its colour from the script
    expect(root.querySelectorAll('[role="log"] li.justify-end')).toHaveLength(1);
    expect(canvas.getByText("Anne")).toHaveStyle({ color: "rgb(139, 0, 0)" });
    // read-only: no start, no message box, no clock
    expect(canvas.queryByRole("textbox")).toBeNull();
    expect(canvas.queryByRole("button")).toBeNull();
    expect(canvas.queryByRole("progressbar")).toBeNull();
    expect(response(pci)).toBe(FINISHED);
  },
};

export const ReviewWithoutResponse: Story = {
  args: { status: "review" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("No messages yet.")).toBeInTheDocument();
    expect(canvas.queryByRole("button")).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const BoundResponse: Story = {
  // a response without a state: the finished chat, read-only
  args: { boundTo: { RESPONSE: { base: { string: FINISHED } } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci, root } = await openPci(canvasElement);

    await step("shown as a finished chat", async () => {
      await waitFor(() => expect(messages(root)).toEqual(["Anne: Axes", "You: A museum", "Lars: Ships"]));
      expect(canvas.getByRole("alert")).toHaveTextContent("Time is up. Go to next task.");
      expect(canvas.getByRole("textbox")).toBeDisabled();
      expect(canvas.queryByRole("button", { name: /ready/ })).toBeNull();
      expect(response(pci)).toBe(FINISHED);
    });

    await step("resetResponse starts it over", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByRole("button", { name: "Click here when you are ready to brainstorm" })).toBeInTheDocument());
      expect(messages(root)).toEqual([]);
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const RestoresState: Story = {
  args: { properties: QUIET },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await say(first.canvas.getByRole("textbox"), "Idea one");
    await waitFor(() => expect(messages(first.root)).toEqual(["You: Idea one"]));
    await sleep(1100);
    const said = response(first.pci);
    const state = first.pci.getState();
    expect(JSON.parse(state).state.elapsed).toBeGreaterThanOrEqual(1000);

    // the candidate comes back: the chat goes on where it was (no start again, the clock continues)
    const second = await remountPci(canvasElement, pci, { properties: QUIET, state });
    await waitFor(() => expect(messages(second.root)).toEqual(["You: Idea one"]));
    expect(response(second.pci)).toBe(said);
    const input = second.canvas.getByRole("textbox");
    expect(input).toBeEnabled();
    expect(Number(second.canvas.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThan(100);
    await say(input, "Idea two");
    await waitFor(() => expect(messages(second.root)).toEqual(["You: Idea one", "You: Idea two"]));
    expect(response(second.pci)).toMatch(new RegExp(`^${said.replace(/\|/g, "\\|")}\\|00:0\\d;You;Idea two$`));
  },
};
