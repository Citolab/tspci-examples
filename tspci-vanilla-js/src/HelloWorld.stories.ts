import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, retype, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Percentages",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const QUESTION = "What percentage of the circle is coloured?";

/**
 * Leaves the answer field: the browser fires "change". user-event commits a typed value with a change event when the
 * field loses the focus, but it does not see the focus inside a shadow root (Tab, a click elsewhere or blur() leave
 * no change), so the story fires the event the browser would.
 */
const leave = (canvas: MountedPci["canvas"]) =>
  canvas.getByRole("spinbutton").dispatchEvent(new Event("change", { bubbles: true }));

/** The fill of every slice of the pie, starting at the top. */
const fills = (root: ShadowRoot | HTMLElement) => [...root.querySelectorAll("path.slice")].map((p) => p.getAttribute("fill"));

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Percentages");
    // 3 of 10 slices in the default colour
    const pie = canvas.getByRole("img", { name: "3 / 10" });
    expect(pie).toHaveAttribute("width", "200");
    expect(fills(root)).toEqual([...Array(3).fill("#7ac943"), ...Array(7).fill("#eef1f4")]);
    // the question is the name of the answer field, which starts empty
    const input = canvas.getByRole("spinbutton", { name: QUESTION });
    expect(input).toHaveValue(null);
    expect(input).toBeEnabled();
    expect(pci.getResponse()).toBeUndefined();
    expect(pci.getState()).toBe("");
  },
};

export const Answering: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const input = canvas.getByRole("spinbutton", { name: QUESTION });

    await step("the answer counts once the field changes (on leaving it), as an integer", async () => {
      await userEvent.type(input, "30");
      expect(mounted.changes).toHaveLength(0);
      await leave(canvas);
      expect(await lastChange(mounted)).toEqual({ base: { integer: 30 } });
      expect(pci.getResponse()).toEqual({ base: { integer: 30 } });
      expect(pci.getState()).toBe("30");
    });

    await step("a decimal answer is cut to a whole percentage", async () => {
      await retype(input, "12.7");
      await leave(canvas);
      expect(await lastChange(mounted, 2)).toEqual({ base: { integer: 12 } });
      expect(pci.getResponse()).toEqual({ base: { integer: 12 } });
    });

    await step("an emptied field is no response", async () => {
      await retype(input, "{Backspace}");
      await leave(canvas);
      expect(await lastChange(mounted, 3)).toBeUndefined();
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Configured: Story = {
  args: {
    properties: {
      title: "Pizza",
      question: "How much of the pizza is eaten?",
      segments: "4",
      colored: "1",
      color: "#ff0000",
      size: "300",
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Pizza");
    expect(canvas.getByRole("img", { name: "1 / 4" })).toHaveAttribute("width", "300");
    expect(fills(root)).toEqual(["#ff0000", "#eef1f4", "#eef1f4", "#eef1f4"]);
    expect(canvas.getByRole("spinbutton", { name: "How much of the pizza is eaten?" })).toBeInTheDocument();
  },
};

export const ClampedSettings: Story = {
  args: { properties: { segments: "50", colored: "99", size: "20" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    // at most 24 slices, no more coloured than there are, and at least 100 px
    expect(canvas.getByRole("img", { name: "24 / 24" })).toHaveAttribute("width", "100");
    expect(fills(root)).toEqual(Array(24).fill("#7ac943"));
  },
};

export const InvalidSettings: Story = {
  args: { properties: { segments: "many", colored: "-2", size: "huge" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    // not a number: 10 slices and 200 px; below 0 coloured: none
    expect(canvas.getByRole("img", { name: "0 / 10" })).toHaveAttribute("width", "200");
  },
};

export const EscapesText: Story = {
  args: { properties: { title: "<b>Bold</b> & co", color: '"><script>' } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    // the settings are shown as text, never as markup
    expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("<b>Bold</b> & co");
    expect(root.querySelector("h1 b")).toBeNull();
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("path.slice")).toHaveAttribute("fill", '"><script>');
  },
};

export const Review: Story = {
  args: { status: "review", state: "40" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const input = canvas.getByRole("spinbutton", { name: QUESTION });
    expect(input).toHaveValue(40);
    expect(input).toBeDisabled();
    expect(pci.getResponse()).toEqual({ base: { integer: 40 } });
  },
};

export const Solution: Story = {
  args: { status: "solution", state: "55", responseDeclaration: { correctResponse: { value: "30" } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the correct response replaces the candidate's answer", async () => {
      const input = canvas.getByRole("spinbutton", { name: QUESTION });
      expect(input).toHaveValue(30);
      expect(input).toBeDisabled();
      expect(pci.getResponse()).toEqual({ base: { integer: 30 } });
    });

    await step("without a correct response, solution shows the candidate's answer", async () => {
      const second = await remountPci(canvasElement, pci, { status: "solution", state: "55" });
      expect(second.canvas.getByRole("spinbutton", { name: QUESTION })).toHaveValue(55);
      expect(second.pci.getResponse()).toEqual({ base: { integer: 55 } });
    });
  },
};

export const ShowCorrectResponse: Story = {
  args: { responseDeclaration: { correctResponse: { value: "30" } } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const input = canvas.getByRole("spinbutton", { name: QUESTION });
    // while interacting, the correct response is not shown
    expect(input).toHaveValue(null);
    // a delivery engine moving the running interaction into review
    pci.showCorrectResponse();
    expect(canvas.getByRole("spinbutton", { name: QUESTION })).toHaveValue(30);
    expect(pci.getResponse()).toEqual({ base: { integer: 30 } });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(first.canvas.getByRole("spinbutton", { name: QUESTION }), "45");
    await leave(first.canvas);
    const state = first.pci.getState();
    expect(state).toBe("45");

    const second = await remountPci(canvasElement, pci, { state });
    expect(second.canvas.getByRole("spinbutton", { name: QUESTION })).toHaveValue(45);
    expect(second.pci.getResponse()).toEqual({ base: { integer: 45 } });
  },
};
