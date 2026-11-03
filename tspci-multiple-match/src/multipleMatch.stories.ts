import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

// Wide enough for the table: 3 topics × 4 categories need 160 + 12 × 64 = 928 px, narrower gives cards
const meta = {
  title: "Multiple match",
  render: (args) => mountPci(pci, args),
  args: { width: 1200 },
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const TOPICS = ["group1", "group2", "group3"];
const ITEMS = ["item1", "item2", "item3"];

/** The response string of the defaults: every topic × item, in the authored order (items, then topics). */
const response = (answers: Record<string, string | string[]>, empty: string | string[] = "", topics = TOPICS) => {
  const result: Record<string, string | string[]> = {};
  for (const item of ITEMS) for (const topic of topics) result[`${topic}_${item}`] = answers[`${topic}_${item}`] ?? empty;
  return { base: { string: JSON.stringify(result) } };
};

/** The item labels of the rows, top to bottom. */
const rowLabels = (root: ShadowRoot | HTMLElement) =>
  [...root.querySelectorAll("tbody th[scope=row]")].map((th) => th.textContent?.trim());

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("a table of 3 items × 3 topics × 4 categories, and no response", async () => {
      expect(canvas.getByRole("table", { name: "Answer table" })).toBeInTheDocument();
      expect([...root.querySelectorAll("thead th[scope=colgroup]")].map((th) => th.textContent)).toEqual(["Group 1", "Group 2", "Group 3"]);
      expect(rowLabels(root)).toEqual(["Item 1", "Item 2", "Item 3"]);
      expect(canvas.getAllByRole("radio")).toHaveLength(36);
      expect(canvas.getByText("Choose one answer per topic for every item. Choose it again to take it back.")).toBeInTheDocument();
      expect(canvas.getByTestId("progress")).toHaveTextContent("0 of 9 answered");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("a choice gives the original's JSON string, with every topic × item", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Agree (Item 1, Group 2)" }));
      expect(canvas.getByRole("radio", { name: "Agree (Item 1, Group 2)" })).toBeChecked();
      expect(pci.getResponse()).toEqual(response({ group2_item1: "3" }));
      expect(await lastChange(mounted)).toEqual(response({ group2_item1: "3" }));
      expect(canvas.getByTestId("progress")).toHaveTextContent("1 of 9 answered");
    });

    await step("another category for the same choice replaces it", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Strongly disagree (Item 1, Group 2)" }));
      await userEvent.click(canvas.getByRole("radio", { name: "Strongly agree (Item 3, Group 1)" }));
      expect(canvas.getByRole("radio", { name: "Agree (Item 1, Group 2)" })).not.toBeChecked();
      expect(pci.getResponse()).toEqual(response({ group2_item1: "1", group1_item3: "4" }));
      expect(canvas.getByTestId("progress")).toHaveTextContent("2 of 9 answered");
    });

    await step("choosing the chosen one again takes it back; nothing left: no response", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Strongly agree (Item 3, Group 1)" }));
      expect(canvas.getByRole("radio", { name: "Strongly agree (Item 3, Group 1)" })).not.toBeChecked();
      expect(pci.getResponse()).toEqual(response({ group2_item1: "1" }));
      await userEvent.click(canvas.getByRole("radio", { name: "Strongly disagree (Item 1, Group 2)" }));
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted, 5)).toBeUndefined();
    });
  },
};

export const Cards: Story = {
  args: { width: 500 },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    // narrow: every item is a card with a radio group per topic
    await waitFor(() => expect(root.querySelector('[data-testid="cards"]')).not.toBeNull());
    expect(root.querySelector("table")).toBeNull();
    expect(canvas.getAllByRole("radiogroup")).toHaveLength(9);
    const group = canvas.getByRole("radiogroup", { name: "Item 2, Group 3" });
    await userEvent.click(within(group).getByText("Disagree"));
    expect(within(group).getByRole("radio", { name: "Disagree (Item 2, Group 3)" })).toBeChecked();
    expect(pci.getResponse()).toEqual(response({ group3_item2: "2" }));
  },
};

export const Multiple: Story = {
  args: { properties: { multiple: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.queryAllByRole("radio")).toHaveLength(0);
    expect(canvas.getAllByRole("checkbox")).toHaveLength(36);
    expect(canvas.getByText("Choose one or more answers per topic for every item.")).toBeInTheDocument();

    // chosen in another order than the categories: the response lists them in the authored order
    await userEvent.click(canvas.getByRole("checkbox", { name: "Strongly disagree (Item 1, Group 1)" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Strongly agree (Item 1, Group 1)" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Agree (Item 2, Group 3)" }));
    expect(pci.getResponse()).toEqual(response({ group1_item1: ["4", "1"], group3_item2: ["3"] }, []));
    expect(await lastChange(mounted, 3)).toEqual(response({ group1_item1: ["4", "1"], group3_item2: ["3"] }, []));

    // a second click switches one off
    await userEvent.click(canvas.getByRole("checkbox", { name: "Strongly agree (Item 1, Group 1)" }));
    expect(pci.getResponse()).toEqual(response({ group1_item1: ["1"], group3_item2: ["3"] }, []));
    expect(canvas.getByTestId("progress")).toHaveTextContent("2 of 9 answered");
  },
};

export const OwnSettings: Story = {
  args: {
    properties: {
      topics: "math:Mathematics:How you feel<br>about maths\nread:Reading",
      categories: "yes:Yes\nno:No",
      items: "I like this subject\ngood:I am good at it",
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    expect([...root.querySelectorAll("thead th[scope=colgroup]")].map((th) => th.textContent)).toEqual(["Mathematics", "Reading"]);
    // the description, its <br> as a line break (as text, not HTML)
    expect(canvas.getByText("How you feel")).toBeInTheDocument();
    expect(canvas.getByText("about maths")).toBeInTheDocument();
    expect(rowLabels(root)).toEqual(["I like this subject", "I am good at it"]);
    expect(canvas.getAllByRole("radio")).toHaveLength(8);

    await userEvent.click(canvas.getByRole("radio", { name: "Yes (I like this subject, Reading)" }));
    await userEvent.click(canvas.getByRole("radio", { name: "No (I am good at it, Mathematics)" }));
    // an item without a name is named after its text: lower case, without non-word characters
    expect(pci.getResponse()).toEqual({
      base: { string: JSON.stringify({ math_ilikethissubject: "", read_ilikethissubject: "yes", math_good: "no", read_good: "" }) },
    });
  },
};

export const TopicSubset: Story = {
  args: { properties: { topicsubset: "2" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    expect([...root.querySelectorAll("thead th[scope=colgroup]")].map((th) => th.textContent)).toEqual(["Group 1", "Group 2"]);
    expect(canvas.getByTestId("progress")).toHaveTextContent("0 of 6 answered");
    await userEvent.click(canvas.getByRole("radio", { name: "Disagree (Item 3, Group 2)" }));
    // only the topics shown are in the response
    expect(pci.getResponse()).toEqual(response({ group2_item3: "2" }, "", ["group1", "group2"]));
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByRole("table", { name: "Antwoordtabel" })).toBeInTheDocument();
    expect(canvas.getByText("Kies per onderwerp één antwoord voor elk item. Kies het nog eens om het terug te nemen.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "Agree (Item 1, Group 1)" }));
    await waitFor(() => expect(canvas.getByTestId("progress")).toHaveTextContent("1 van 9 beantwoord"));
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    responseDeclaration: {
      baseType: "string",
      correctResponse: { value: [JSON.stringify({ group1_item1: "4", group2_item2: "2", group3_item3: "1" })] },
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getByRole("radio", { name: "Strongly agree (Item 1, Group 1)" })).toBeChecked());
    expect(canvas.getByRole("radio", { name: "Disagree (Item 2, Group 2)" })).toBeChecked();
    expect(canvas.getByRole("radio", { name: "Strongly disagree (Item 3, Group 3)" })).toBeChecked();
    expect(canvas.getByTestId("progress")).toHaveTextContent("3 of 9 answered");
    // read-only: every option is disabled
    for (const radio of canvas.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(pci.getResponse()).toEqual(response({ group1_item1: "4", group2_item2: "2", group3_item3: "1" }));
  },
};

export const RestoresState: Story = {
  args: { properties: { randomizeitems: "true", randomizetopics: "true" } },
  play: async ({ canvasElement }) => {
    // a state with a given (random) order: the candidate sees it again, the response keeps the authored order
    const state = JSON.stringify({
      state: { answers: { group3_item1: ["2"] }, order: { topics: [2, 0, 1], categories: [3, 2, 1, 0], items: [2, 1, 0] } },
      log: [],
    });
    const first = await remountPci(canvasElement, pci, { properties: { randomizeitems: "true", randomizetopics: "true" }, width: 1200, state });
    expect(rowLabels(first.root)).toEqual(["Item 3", "Item 2", "Item 1"]);
    expect([...first.root.querySelectorAll("thead th[scope=colgroup]")].map((th) => th.textContent)).toEqual(["Group 3", "Group 1", "Group 2"]);
    expect(first.canvas.getByRole("radio", { name: "Disagree (Item 1, Group 3)" })).toBeChecked();
    // categories reversed: the first column is the last category
    const firstRow = first.root.querySelector('[data-testid="row-item3"]')!;
    expect(firstRow.querySelector("input")).toHaveAttribute("value", "1");

    await userEvent.click(first.canvas.getByRole("radio", { name: "Agree (Item 2, Group 1)" }));
    expect(first.pci.getResponse()).toEqual(response({ group3_item1: "2", group1_item2: "3" }));

    const second = await remountPci(canvasElement, pci, {
      properties: { randomizeitems: "true", randomizetopics: "true" },
      width: 1200,
      state: first.pci.getState(),
    });
    expect(rowLabels(second.root)).toEqual(["Item 3", "Item 2", "Item 1"]);
    expect(second.canvas.getByRole("radio", { name: "Agree (Item 2, Group 1)" })).toBeChecked();
    expect(second.pci.getResponse()).toEqual(response({ group3_item1: "2", group1_item2: "3" }));
  },
};

export const BoundResponse: Story = {
  args: {
    boundTo: { RESPONSE: { base: { string: JSON.stringify({ group1_item2: "3", group2_item2: "9", group3_item3: "1" }) } } },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the response the player hands back is shown; values that are no category are dropped", async () => {
      await waitFor(() => expect(canvas.getByRole("radio", { name: "Agree (Item 2, Group 1)" })).toBeChecked());
      expect(canvas.getByRole("radio", { name: "Strongly disagree (Item 3, Group 3)" })).toBeChecked();
      expect(pci.getResponse()).toEqual(response({ group1_item2: "3", group3_item3: "1" }));
    });

    await step("setResponse replaces it", async () => {
      pci.setResponse({ base: { string: JSON.stringify({ group2_item1: "4" }) } });
      await waitFor(() => expect(canvas.getByRole("radio", { name: "Strongly agree (Item 1, Group 2)" })).toBeChecked());
      expect(canvas.getByRole("radio", { name: "Agree (Item 2, Group 1)" })).not.toBeChecked();
      expect(pci.getResponse()).toEqual(response({ group2_item1: "4" }));
    });

    await step("resetResponse empties it, and tells the player", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByRole("radio", { name: "Strongly agree (Item 1, Group 2)" })).not.toBeChecked());
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
      expect(canvas.getByTestId("progress")).toHaveTextContent("0 of 9 answered");
    });
  },
};

export const NothingToAnswer: Story = {
  args: { properties: { items: "" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("There is nothing to answer: add topics, categories and items.")).toBeInTheDocument();
    expect(canvas.queryByRole("table")).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};
