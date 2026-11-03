import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Likert scale",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "How much do you agree with this statement?";

/** The accessible names of the levels, low to high. */
const levelNames = (canvas: MountedPci["canvas"]) =>
  canvas.getAllByRole("radio").map((r) => r.getAttribute("aria-label"));
/** The chosen level (1-based), or null. */
const checkedLevel = (canvas: MountedPci["canvas"]) => {
  const index = canvas.getAllByRole("radio").findIndex((r) => (r as HTMLInputElement).checked);
  return index < 0 ? null : index + 1;
};
/** The names of the thumb icons at the ends (decoration: inside an aria-hidden end label). */
const thumbs = (root: ShadowRoot | HTMLElement) => [...root.querySelectorAll("svg[role=img]")].map((s) => s.getAttribute("aria-label"));
/** What the candidate clicks: the label that fills the part of the scale of a level. */
const level = (canvas: MountedPci["canvas"], n: number) => canvas.getByTestId(`level-${n}`);

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    // the question is the name of the group of radio buttons
    expect(canvas.getByRole("group", { name: PROMPT })).toBeInTheDocument();
    expect(levelNames(canvas)).toEqual(["1 of 5, lowest: min", "2 of 5", "3 of 5", "4 of 5", "5 of 5, highest: max"]);
    expect(canvas.getByTestId("label-min")).toHaveTextContent("min");
    expect(canvas.getByTestId("label-max")).toHaveTextContent("max");
    // no icons and no numbers by default
    expect(thumbs(root)).toEqual([]);
    expect(checkedLevel(canvas)).toBeNull();
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const Choosing: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a click on a level chooses it", async () => {
      await userEvent.click(level(canvas, 3));
      expect(canvas.getByRole("radio", { name: "3 of 5" })).toBeChecked();
      expect(level(canvas, 3)).toHaveAttribute("data-selected", "true");
      expect(pci.getResponse()).toEqual({ base: { integer: 3 } });
      expect(await lastChange(mounted)).toEqual({ base: { integer: 3 } });
    });

    await step("another level replaces it", async () => {
      await userEvent.click(level(canvas, 5));
      expect(checkedLevel(canvas)).toBe(5);
      expect(level(canvas, 3)).toHaveAttribute("data-selected", "false");
      expect(await lastChange(mounted, 2)).toEqual({ base: { integer: 5 } });
    });

  },
};

export const SevenPointScale: Story = {
  args: {
    properties: {
      prompt: "I enjoy solving maths problems.",
      level: "7",
      labelMin: "Strongly disagree",
      labelMax: "Strongly agree",
      icons: "true",
      numbers: "true",
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("group", { name: "I enjoy solving maths problems." })).toBeInTheDocument();
    expect(levelNames(canvas)).toEqual([
      "1 of 7, lowest: Strongly disagree", "2 of 7", "3 of 7", "4 of 7", "5 of 7", "6 of 7", "7 of 7, highest: Strongly agree",
    ]);
    expect(thumbs(root)).toEqual(["thumb down", "thumb up"]);
    // the numbers above the choices
    expect(level(canvas, 6)).toHaveTextContent(/^6$/);
    await userEvent.click(level(canvas, 7));
    expect(pci.getResponse()).toEqual({ base: { integer: 7 } });
  },
};

export const OriginalAttributeNames: Story = {
  // the original PCI's label-min/label-max, and attributes in lower case as some delivery systems hand them over
  args: { properties: { "label-min": "Never", "label-max": "Always", LEVEL: "3" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(levelNames(canvas)).toEqual(["1 of 3, lowest: Never", "2 of 3", "3 of 3, highest: Always"]);
  },
};

export const LevelsOutOfRange: Story = {
  args: { properties: { level: "15" } },
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await step("at most 10 levels", async () => {
      expect(first.canvas.getAllByRole("radio")).toHaveLength(10);
    });
    await step("at least 2 levels", async () => {
      const second = await remountPci(canvasElement, pci, { properties: { level: "1" } });
      expect(levelNames(second.canvas)).toEqual(["1 of 2, lowest: min", "2 of 2, highest: max"]);
    });
    await step("not a number: 5 levels", async () => {
      const third = await remountPci(canvasElement, pci, { properties: { level: "lots" } });
      expect(third.canvas.getAllByRole("radio")).toHaveLength(5);
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "", labelMin: "oneens", labelMax: "eens", icons: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    // without a question the group is still named, for a screen reader
    expect(canvas.getByRole("group", { name: "Schaal" })).toBeInTheDocument();
    expect(levelNames(canvas)).toEqual(["1 van 5, laagste: oneens", "2 van 5", "3 van 5", "4 van 5", "5 van 5, hoogste: eens"]);
    expect(thumbs(root)).toEqual(["duim omlaag", "duim omhoog"]);
    await userEvent.click(level(canvas, 2));
    expect(pci.getResponse()).toEqual({ base: { integer: 2 } });
  },
};

export const Stars: Story = {
  args: { properties: { style: "stars" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    const stars = () => [...root.querySelectorAll('[data-testid^="level-"] svg')].map((s) => s.getAttribute("class") ?? "");

    await step("under the pointer, the stars up to it are a preview", async () => {
      await userEvent.hover(level(canvas, 4));
      expect(stars().map((c) => c.includes("fill-amber-200"))).toEqual([true, true, true, true, false]);
    });

    await step("every star up to the chosen one is filled", async () => {
      await userEvent.click(level(canvas, 3));
      await userEvent.unhover(root.querySelector("ul")!);
      expect(stars().map((c) => c.includes("fill-amber-400"))).toEqual([true, true, true, false, false]);
      expect(pci.getResponse()).toEqual({ base: { integer: 3 } });
    });
  },
};

export const NumberedButtons: Story = {
  args: { properties: { style: "buttons", numbers: "true" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the number is on the button itself, not above it as well
    for (const n of [1, 2, 3, 4, 5]) expect(level(canvas, n)).toHaveTextContent(new RegExp(`^${n}$`));
    await userEvent.click(level(canvas, 1));
    expect(checkedLevel(canvas)).toBe(1);
    expect(pci.getResponse()).toEqual({ base: { integer: 1 } });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(level(first.canvas, 4));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ chosen: 4 });

    await step("its own state", async () => {
      const second = await remountPci(canvasElement, pci, { state });
      expect(checkedLevel(second.canvas)).toBe(4);
      expect(second.pci.getResponse()).toEqual({ base: { integer: 4 } });
      // restoring is not a change by the candidate
      expect(second.changes).toHaveLength(0);
    });

    await step("a state of the original likertScoreInteraction", async () => {
      const third = await remountPci(canvasElement, pci, { state: JSON.stringify({ response: { base: { integer: 2 } } }) });
      expect(checkedLevel(third.canvas)).toBe(2);
      expect(third.pci.getResponse()).toEqual({ base: { integer: 2 } });
    });

    await step("a level the scale no longer has is no choice", async () => {
      const fourth = await remountPci(canvasElement, pci, { state, properties: { level: "3" } });
      expect(checkedLevel(fourth.canvas)).toBeNull();
      expect(fourth.pci.getResponse()).toBeUndefined();
    });

    await step("a state that is not one of this PCI is ignored", async () => {
      const fifth = await remountPci(canvasElement, pci, { state: "not json" });
      expect(checkedLevel(fifth.canvas)).toBeNull();
      expect(fifth.pci.getResponse()).toBeUndefined();
    });
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { integer: 4 } } } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the bound response is shown", async () => {
      await waitFor(() => expect(checkedLevel(canvas)).toBe(4));
      expect(pci.getResponse()).toEqual({ base: { integer: 4 } });
      expect(mounted.changes).toHaveLength(0);
    });

    await step("setResponse takes a level as a string too (TAO)", async () => {
      pci.setResponse({ base: { string: "2" } });
      await waitFor(() => expect(checkedLevel(canvas)).toBe(2));
      expect(await lastChange(mounted)).toEqual({ base: { integer: 2 } });
    });

    await step("0, the original's 'no answer', clears the choice", async () => {
      pci.setResponse({ base: { integer: 0 } });
      await waitFor(() => expect(checkedLevel(canvas)).toBeNull());
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("resetResponse clears it as well", async () => {
      pci.setResponse({ base: { integer: 5 } });
      await waitFor(() => expect(checkedLevel(canvas)).toBe(5));
      pci.resetResponse();
      await waitFor(() => expect(checkedLevel(canvas)).toBeNull());
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: JSON.stringify({ state: { chosen: 1 }, log: [] }), responseDeclaration: { correctResponse: { value: "4" } } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct response replaces the candidate's choice
    await waitFor(() => expect(checkedLevel(canvas)).toBe(4));
    expect(pci.getResponse()).toEqual({ base: { integer: 4 } });
  },
};
