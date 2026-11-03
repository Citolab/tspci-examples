import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Q-sort",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** A small Q-sort: four statements in the authored order, columns −1 (1 place), 0 (2 places) and +1 (1 place). */
const SMALL = { statements: "Alpha\nBeta\nGamma\nDelta", distribution: "1,2,1", randomOrder: "false", presort: "false" };

const response = (value: { sort: (number | null)[]; presort?: (number | null)[] }) => ({ base: { string: JSON.stringify(value) } });

/** The card of a statement (its name says where it is: "Alpha, in the statements"). */
const card = (mounted: MountedPci, text: string) => mounted.canvas.getByRole("button", { name: new RegExp(`^${text}, in `) });
const slot = (mounted: MountedPci, n: number) => mounted.root.querySelector<HTMLElement>(`[data-slot="${n}"]`)!;
const live = (mounted: MountedPci) => mounted.root.querySelector('[data-testid="live"]')!;
/** The statements in the places of the grid, place by place. */
const grid = (mounted: MountedPci) =>
  [...mounted.root.querySelectorAll<HTMLElement>("[data-slot]")].map((s) => s.querySelector("[data-statement]")?.textContent ?? null);

const middle = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};

/** A drag with the mouse: the card keeps the pointer (pointerId 1, the mouse, so setPointerCapture accepts it). */
const drag = (from: Element, to: Element) => {
  const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
  fireEvent.pointerDown(from, { ...pointer, ...middle(from) });
  fireEvent.pointerMove(from, { ...pointer, ...middle(to), buttons: 1 });
  fireEvent.pointerUp(from, { ...pointer, ...middle(to) });
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    // the defaults pre-sort: step 1 shows one card at a time on the stack, and three piles; no grid yet
    expect(canvas.getByText(/^Step 1 of 2: put every card on one of the three piles\./)).toBeInTheDocument();
    const stack = canvas.getByRole("group", { name: "To sort" });
    expect(within(stack).getByText("16 cards left")).toBeInTheDocument();
    expect(within(stack).getAllByRole("button")).toHaveLength(1);
    for (const pile of ["Disagree", "Neutral", "Agree"]) expect(canvas.getByRole("group", { name: pile })).toBeInTheDocument();
    expect(canvas.queryByRole("group", { name: "Q-sort grid" })).toBeNull();
    expect(root.querySelector("[data-slot]")).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const ClickToPlace: Story = {
  args: { properties: SMALL },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a grid of 1, 2 and 1 places from −1 to +1, the cards below it", async () => {
      expect(canvas.getByRole("group", { name: "Q-sort grid" })).toBeInTheDocument();
      expect([0, 1, 2].map((c) => mounted.root.querySelector(`[data-testid="value-${c}"]`)!.textContent)).toEqual(["−1", "0", "+1"]);
      expect(grid(mounted)).toEqual([null, null, null, null]);
      const pool = canvas.getByRole("group", { name: "Statements" });
      expect(within(pool).getAllByRole("button").map((b) => b.textContent)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
      expect(canvas.getByTestId("progress")).toHaveTextContent("0 of 4 placed");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("click a card, then a place", async () => {
      await userEvent.click(card(mounted, "Alpha"));
      expect(card(mounted, "Alpha")).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(slot(mounted, 0));
      await waitFor(() => expect(grid(mounted)).toEqual(["Alpha", null, null, null]));
      expect(card(mounted, "Alpha")).toHaveAccessibleName("Alpha, in column −1 (Most disagree), place 1 of 1");
      expect(pci.getResponse()).toEqual(response({ sort: [-1, null, null, null] }));
      expect(await lastChange(mounted)).toEqual(response({ sort: [-1, null, null, null] }));
      expect(canvas.getByTestId("progress")).toHaveTextContent("1 of 4 placed");
    });

    await step("a card put on a card in the grid takes its place; that one goes back", async () => {
      await userEvent.click(card(mounted, "Beta"));
      await userEvent.click(card(mounted, "Alpha"));
      await waitFor(() => expect(grid(mounted)).toEqual(["Beta", null, null, null]));
      expect(live(mounted)).toHaveTextContent("Beta put in column −1 (Most disagree), place 1 of 1; Alpha took its old place.");
      expect(card(mounted, "Alpha")).toHaveAccessibleName("Alpha, in the statements");
      expect(pci.getResponse()).toEqual(response({ sort: [null, -1, null, null] }));
    });

    await step("within the grid two cards swap places", async () => {
      await userEvent.click(card(mounted, "Gamma"));
      await userEvent.click(slot(mounted, 3));
      await userEvent.click(card(mounted, "Gamma"));
      await userEvent.click(card(mounted, "Beta"));
      await waitFor(() => expect(grid(mounted)).toEqual(["Gamma", null, null, "Beta"]));
      expect(pci.getResponse()).toEqual(response({ sort: [null, 1, -1, null] }));
    });

    await step("a card clicked onto the statements goes back", async () => {
      await userEvent.click(card(mounted, "Gamma"));
      await userEvent.click(canvas.getByRole("group", { name: "Statements" }));
      await waitFor(() => expect(grid(mounted)).toEqual([null, null, null, "Beta"]));
      expect(pci.getResponse()).toEqual(response({ sort: [null, 1, null, null] }));
    });
  },
};

export const Keyboard: Story = {
  args: { properties: SMALL },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;

    await step("Space picks up a card, the arrows choose a place, Space puts it down", async () => {
      card(mounted, "Gamma").focus();
      await userEvent.keyboard(" ");
      await waitFor(() => expect(card(mounted, "Gamma")).toHaveAttribute("aria-pressed", "true"));
      expect(live(mounted)).toHaveTextContent(/^Gamma picked up\. Now at the statements\./);
      // up from the statements: the lowest place of the middle column
      await userEvent.keyboard("{ArrowUp}");
      await waitFor(() => expect(live(mounted)).toHaveTextContent("column 0, place 2 of 2, empty"));
      await userEvent.keyboard("{ArrowLeft}");
      await waitFor(() => expect(live(mounted)).toHaveTextContent("column −1 (Most disagree), place 1 of 1, empty"));
      await userEvent.keyboard("{ArrowRight}{ArrowRight}");
      await waitFor(() => expect(live(mounted)).toHaveTextContent("column +1 (Most agree), place 1 of 1, empty"));
      await userEvent.keyboard(" ");
      await waitFor(() => expect(grid(mounted)).toEqual([null, null, null, "Gamma"]));
      expect(live(mounted)).toHaveTextContent("Gamma put in column +1 (Most agree), place 1 of 1.");
      expect(pci.getResponse()).toEqual(response({ sort: [null, null, 1, null] }));
    });

    await step("Escape cancels", async () => {
      card(mounted, "Delta").focus();
      await userEvent.keyboard(" ");
      await userEvent.keyboard("{ArrowUp}");
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(live(mounted)).toHaveTextContent("Delta put back where it was."));
      expect(card(mounted, "Delta")).toHaveAttribute("aria-pressed", "false");
      expect(grid(mounted)).toEqual([null, null, null, "Gamma"]);
    });

    await step("Delete puts a placed card back", async () => {
      card(mounted, "Gamma").focus();
      await userEvent.keyboard("{Delete}");
      await waitFor(() => expect(grid(mounted)).toEqual([null, null, null, null]));
      expect(live(mounted)).toHaveTextContent("Gamma put back on the statements.");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const DragAndDrop: Story = {
  args: { properties: SMALL },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    drag(card(mounted, "Alpha"), slot(mounted, 3));
    await waitFor(() => expect(grid(mounted)).toEqual([null, null, null, "Alpha"]));
    expect(pci.getResponse()).toEqual(response({ sort: [1, null, null, null] }));

    // within the grid, then a card from the statements onto it: they change places
    drag(card(mounted, "Alpha"), slot(mounted, 1));
    await waitFor(() => expect(grid(mounted)).toEqual([null, "Alpha", null, null]));
    drag(card(mounted, "Delta"), card(mounted, "Alpha"));
    await waitFor(() => expect(grid(mounted)).toEqual([null, "Delta", null, null]));
    expect(pci.getResponse()).toEqual(response({ sort: [null, null, null, 0] }));

    // dragged onto the statements: back out of the grid
    drag(card(mounted, "Delta"), mounted.canvas.getByRole("group", { name: "Statements" }));
    await waitFor(() => expect(grid(mounted)).toEqual([null, null, null, null]));
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const PreSort: Story = {
  args: { properties: { ...SMALL, presort: "true" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const stack = () => canvas.getByRole("group", { name: "To sort" });

    await step("step 1: every card on a pile, one at a time", async () => {
      expect(within(stack()).getByRole("button")).toHaveTextContent("Alpha");
      await userEvent.click(card(mounted, "Alpha"));
      await userEvent.click(canvas.getByRole("group", { name: "Disagree" }));
      await waitFor(() => expect(within(stack()).getByRole("button")).toHaveTextContent("Beta"));
      expect(within(stack()).getByText("3 cards left")).toBeInTheDocument();
      expect(pci.getResponse()).toEqual(response({ sort: [null, null, null, null], presort: [-1, null, null, null] }));
      expect(await lastChange(mounted)).toEqual(response({ sort: [null, null, null, null], presort: [-1, null, null, null] }));

      // with the keyboard: right from the stack are the piles
      card(mounted, "Beta").focus();
      await userEvent.keyboard(" ");
      await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
      await waitFor(() => expect(live(mounted)).toHaveTextContent("the pile Agree"));
      await userEvent.keyboard(" ");
      await waitFor(() => expect(within(stack()).getByRole("button")).toHaveTextContent("Gamma"));

      await userEvent.click(card(mounted, "Gamma"));
      await userEvent.click(canvas.getByRole("group", { name: "Neutral" }));
      expect(canvas.queryByRole("group", { name: "Q-sort grid" })).toBeNull();
      await userEvent.click(card(mounted, "Delta"));
      await userEvent.click(canvas.getByRole("group", { name: "Agree" }));
    });

    await step("step 2: the grid appears, the cards come from the piles", async () => {
      await waitFor(() => expect(canvas.getByRole("group", { name: "Q-sort grid" })).toBeInTheDocument());
      expect(live(mounted)).toHaveTextContent("All cards are on a pile. The grid is shown: now place them in the grid.");
      expect(canvas.getByText(/^Step 2 of 2: place every statement in the grid\. Start at the ends: the cards you agree with most from the pile Agree, the ones you disagree with most from the pile Disagree/)).toBeInTheDocument();
      expect(within(canvas.getByRole("group", { name: "Agree" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Beta", "Delta"]);
      expect(pci.getResponse()).toEqual(response({ sort: [null, null, null, null], presort: [-1, 1, 0, 1] }));

      await userEvent.click(card(mounted, "Beta"));
      await userEvent.click(slot(mounted, 3));
      await waitFor(() => expect(grid(mounted)).toEqual([null, null, null, "Beta"]));
      expect(pci.getResponse()).toEqual(response({ sort: [null, 1, null, null], presort: [-1, 1, 0, 1] }));
    });

    await step("a card moved to another pile in step 2 reports its last pile", async () => {
      await userEvent.click(card(mounted, "Delta"));
      await userEvent.click(canvas.getByRole("group", { name: "Neutral" }));
      await waitFor(() => expect(pci.getResponse()).toEqual(response({ sort: [null, 1, null, null], presort: [-1, 1, 0, 0] })));
      // a card from the grid goes back to its own pile
      card(mounted, "Beta").focus();
      await userEvent.keyboard("{Delete}");
      await waitFor(() => expect(within(canvas.getByRole("group", { name: "Agree" })).getByRole("button")).toHaveTextContent("Beta"));
    });
  },
};

export const OwnScale: Story = {
  args: {
    properties: {
      ...SMALL,
      values: "10, 20, 30",
      lowLabel: "Least like me",
      highLabel: "Most like me",
      orientation: "vertical",
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    expect(canvas.getByRole("group", { name: "Q-sort grid" })).toHaveAttribute("data-orientation", "vertical");
    // vertical: the highest row on top
    expect([...root.querySelectorAll('[data-testid^="column-"]')].map((c) => c.getAttribute("data-testid"))).toEqual(["column-2", "column-1", "column-0"]);
    expect(within(canvas.getByTestId("scale")).getByText("Most like me")).toBeInTheDocument();
    await userEvent.click(card(mounted, "Beta"));
    await userEvent.click(slot(mounted, 0));
    await waitFor(() => expect(card(mounted, "Beta")).toHaveAccessibleName("Beta, in column +10 (Least like me), place 1 of 1"));
    expect(pci.getResponse()).toEqual(response({ sort: [null, 10, null, null] }));
  },
};

export const Dutch: Story = {
  args: { properties: { ...SMALL, language: "nl", lowLabel: "Meest oneens", highLabel: "Meest eens" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByText(/^Zet elke stelling in het raster\./)).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: "Q-sort-raster" })).toBeInTheDocument();
    expect(card(mounted, "Alpha")).toHaveAccessibleName("Alpha, in de stellingen");
    await userEvent.click(card(mounted, "Alpha"));
    await userEvent.click(slot(mounted, 0));
    await waitFor(() => expect(live(mounted)).toHaveTextContent("Alpha gezet in kolom −1 (Meest oneens), plek 1 van 1."));
    expect(canvas.getByTestId("progress")).toHaveTextContent("1 van 4 geplaatst");
  },
};

export const RestoresState: Story = {
  // the default 16 statements, shuffled per candidate
  args: { properties: { presort: "false" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    const pool = (m: MountedPci) => within(m.canvas.getByRole("group", { name: "Statements" })).getAllByRole("button").map((b) => b.textContent);
    const shuffled = pool(first);
    expect(shuffled).toHaveLength(16);
    await userEvent.click(card(first, shuffled[0]!));
    await userEvent.click(slot(first, 0));
    await waitFor(() => expect(grid(first)[0]).toBe(shuffled[0]));
    const placedResponse = first.pci.getResponse();

    const second = await remountPci(canvasElement, pci, { properties: { presort: "false" }, state: first.pci.getState() });
    // the same order of the cards, the same card in the grid
    expect(pool(second)).toEqual(shuffled.slice(1));
    expect(grid(second)[0]).toBe(shuffled[0]);
    expect(second.pci.getResponse()).toEqual(placedResponse);
    const sort = JSON.parse(placedResponse.base.string).sort as (number | null)[];
    expect(sort.filter((v) => v !== null)).toEqual([-3]);
  },
};

export const BoundResponse: Story = {
  // a plain array: a response without a pre-sort, read as the sort
  args: { properties: { ...SMALL, presort: "true" }, boundTo: { RESPONSE: { base: { string: "[-1, 0, 0, 1]" } } } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("every statement in the first free place of its column, on the pile of its side", async () => {
      await waitFor(() => expect(grid(mounted)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]));
      expect(canvas.getByTestId("progress")).toHaveTextContent("4 of 4 placed");
      expect(pci.getResponse()).toEqual(response({ sort: [-1, 0, 0, 1], presort: [-1, 0, 0, 1] }));
    });

    await step("setResponse replaces it; something that is no response resets", async () => {
      pci.setResponse(response({ sort: [null, 1, null, -1], presort: [0, 1, 0, -1] }));
      await waitFor(() => expect(grid(mounted)).toEqual(["Delta", null, null, "Beta"]));
      expect(pci.getResponse()).toEqual(response({ sort: [null, 1, null, -1], presort: [0, 1, 0, -1] }));
      pci.setResponse({ base: { string: "{}" } });
      // back to step 1: every card on the stack
      await waitFor(() => expect(canvas.getByRole("group", { name: "To sort" })).toBeInTheDocument());
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: {
    properties: SMALL,
    status: "solution",
    responseDeclaration: { baseType: "string", correctResponse: { value: JSON.stringify({ sort: [0, 1, -1, 0] }) } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    await waitFor(() => expect(grid(mounted)).toEqual(["Gamma", "Alpha", "Delta", "Beta"]));
    expect(mounted.canvas.getByText("All statements are placed.")).toBeInTheDocument();
    expect(mounted.pci.getResponse()).toEqual(response({ sort: [0, 1, -1, 0] }));
  },
};
