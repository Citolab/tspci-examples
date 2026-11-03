import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Proportions",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const RED = "#dc2626";
const BLUE = "#2563eb";
const GREEN = "#16a34a";

/** The response for these shares: per colour, sorted by colour (as getResponse() writes it). */
const response = (shares: { color: string; percentage: number }[]) => ({ base: { string: JSON.stringify(shares) } });

/** The fill of every part of the shape, in reading order (white is uncoloured). */
const fills = (root: ShadowRoot | HTMLElement) => [...root.querySelectorAll("g[data-name]")].map((g) => g.getAttribute("fill"));

/** Paints a part as the candidate does: a mouse press at its middle, on whatever is drawn there. */
const pressAt = async (root: ShadowRoot | HTMLElement, part: Element) => {
  const box = part.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const target = (root as ShadowRoot).elementFromPoint?.(x, y) ?? document.elementFromPoint(x, y);
  expect(target?.closest("g[data-name]")).toBe(part);
  await userEvent.pointer({ keys: "[MouseLeft]", target: target!, coords: { clientX: x, clientY: y } });
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("the standard shape: six white parts, the first colour chosen, no response", async () => {
      expect(canvas.getByText("Colour the shapes with your mouse.")).toBeInTheDocument();
      await waitFor(() => expect(fills(root)).toEqual(["#fff", "#fff", "#fff", "#fff", "#fff", "#fff"]));
      expect(canvas.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([RED, BLUE, GREEN, "eraser"]);
      expect(canvas.getByRole("radio", { name: RED })).toHaveAttribute("aria-checked", "true");
      expect(canvas.getByRole("button", { name: "Start over" })).toBeDisabled();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the half in red (by the mouse position), the quarter in blue", async () => {
      await pressAt(root, canvas.getByRole("button", { name: "part 1" }));
      await waitFor(() => expect(fills(root)[0]).toBe(RED));
      expect(pci.getResponse()).toEqual(response([{ color: RED, percentage: 50 }]));
      expect(await lastChange(mounted)).toEqual(response([{ color: RED, percentage: 50 }]));

      await userEvent.click(canvas.getByRole("radio", { name: BLUE }));
      expect(canvas.getByRole("radio", { name: BLUE })).toHaveAttribute("aria-checked", "true");
      await pressAt(root, canvas.getByRole("button", { name: "part 2" }));
      await waitFor(() => expect(fills(root)[1]).toBe(BLUE));
      await waitFor(() => expect(fills(root)).toEqual([RED, BLUE, "#fff", "#fff", "#fff", "#fff"]));
      expect(pci.getResponse()).toEqual(response([{ color: BLUE, percentage: 25 }, { color: RED, percentage: 50 }]));
      expect(await lastChange(mounted, 2)).toEqual(response([{ color: BLUE, percentage: 25 }, { color: RED, percentage: 50 }]));
    });

    await step("painting a part again with another colour changes it", async () => {
      await pressAt(root, canvas.getByRole("button", { name: "part 1" }));
      expect(pci.getResponse()).toEqual(response([{ color: BLUE, percentage: 75 }]));
    });

    await step("painting a part with the colour it has is no change", async () => {
      const count = mounted.changes.length;
      await pressAt(root, canvas.getByRole("button", { name: "part 1" }));
      expect(mounted.changes).toHaveLength(count);
    });
  },
};

export const SameProportionsOtherParts: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // 1/4 + 1/8 + 1/16 + 1/32 + 1/32 is a half too: the response is the same as for the half itself
    for (const n of [2, 3, 4, 5, 6]) await userEvent.click(canvas.getByRole("button", { name: `part ${n}` }));
    expect(pci.getResponse()).toEqual(response([{ color: RED, percentage: 50 }]));

    await userEvent.click(canvas.getByRole("radio", { name: GREEN }));
    await userEvent.click(canvas.getByRole("button", { name: "part 5" }));
    expect(pci.getResponse()).toEqual(response([{ color: GREEN, percentage: 3.125 }, { color: RED, percentage: 46.875 }]));
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: GREEN }));
    // (userEvent.keyboard types into document.activeElement, which is the host of the shadow root)
    fireEvent.keyDown(canvas.getByRole("button", { name: "part 3" }), { key: "Enter" });
    expect(pci.getResponse()).toEqual(response([{ color: GREEN, percentage: 12.5 }]));
    fireEvent.keyDown(canvas.getByRole("button", { name: "part 4" }), { key: " " });
    expect(pci.getResponse()).toEqual(response([{ color: GREEN, percentage: 18.75 }]));
  },
};

export const EraseAndStartOver: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    for (const n of [1, 2, 3]) await userEvent.click(canvas.getByRole("button", { name: `part ${n}` }));
    expect(pci.getResponse()).toEqual(response([{ color: RED, percentage: 87.5 }]));

    await step("the eraser makes one part white again", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "eraser" }));
      await userEvent.click(canvas.getByRole("button", { name: "part 1" }));
      await waitFor(() => expect(fills(root)).toEqual(["#fff", RED, RED, "#fff", "#fff", "#fff"]));
      expect(pci.getResponse()).toEqual(response([{ color: RED, percentage: 37.5 }]));
      // erasing a white part is no change
      const count = mounted.changes.length;
      await userEvent.click(canvas.getByRole("button", { name: "part 6" }));
      expect(mounted.changes).toHaveLength(count);
    });

    await step("start over empties every part: no response", async () => {
      const reset = canvas.getByRole("button", { name: "Start over" });
      await waitFor(() => expect(reset).toBeEnabled());
      await userEvent.click(reset);
      await waitFor(() => expect(fills(root)).toEqual(["#fff", "#fff", "#fff", "#fff", "#fff", "#fff"]));
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
      await waitFor(() => expect(reset).toBeDisabled());
    });
  },
};

export const OwnSettings: Story = {
  args: {
    properties: {
      instruction: "Colour two thirds orange.",
      colors: "Orange, #6D28D9",
      resetLabel: "Opnieuw",
      width: "300",
      height: "300",
      // a square split in a left half and two right quarters
      partition: JSON.stringify({ width: 512, height: 512, snap: 4, lines: [[8, 0, 8, 16], [8, 8, 16, 8]] }),
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci, root } = await openPci(canvasElement);
    expect(canvas.getByText("Colour two thirds orange.")).toBeInTheDocument();
    // colours are written in lower case
    expect(canvas.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["orange", "#6d28d9", "eraser"]);
    expect(root.querySelector("svg")).toHaveAttribute("width", "300");
    expect(canvas.getAllByRole("button", { name: /^part / })).toHaveLength(3);
    expect(canvas.getByRole("button", { name: "Opnieuw" })).toBeDisabled();

    await userEvent.click(canvas.getByRole("button", { name: "part 1" }));
    await userEvent.click(canvas.getByRole("radio", { name: "#6d28d9" }));
    await userEvent.click(canvas.getByRole("button", { name: "part 3" }));
    expect(pci.getResponse()).toEqual(response([{ color: "#6d28d9", percentage: 25 }, { color: "orange", percentage: 50 }]));
  },
};

export const UnreadablePartition: Story = {
  args: { properties: { partition: "{not json" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    // the standard shape
    expect(canvas.getAllByRole("button", { name: /^part / })).toHaveLength(6);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "part 2" }));
    await userEvent.click(first.canvas.getByRole("radio", { name: GREEN }));
    await userEvent.click(first.canvas.getByRole("button", { name: "part 4" }));
    const state = first.pci.getState();

    const second = await remountPci(canvasElement, pci, { state });
    await waitFor(() => expect(fills(second.root)).toEqual(["#fff", RED, "#fff", GREEN, "#fff", "#fff"]));
    expect(second.pci.getResponse()).toEqual(response([{ color: GREEN, percentage: 6.25 }, { color: RED, percentage: 25 }]));
    // restoring is not a change by the candidate
    expect(second.changes).toEqual([]);
  },
};

export const LegacyState: Story = {
  // a state saved before the shape was a partition: its parts were named by their size in squares
  args: { state: JSON.stringify({ state: { vlakken: [{ id: "192", color: BLUE }, { id: "12B", color: BLUE }] }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { pci, root } = await openPci(canvasElement);
    await waitFor(() => expect(fills(root)).toEqual([BLUE, "#fff", "#fff", "#fff", "#fff", BLUE]));
    expect(pci.getResponse()).toEqual(response([{ color: BLUE, percentage: 53.125 }]));
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: response([{ color: BLUE, percentage: 25 }, { color: RED, percentage: 75 }]) } },
  play: async ({ canvasElement, step }) => {
    const { pci, root } = await openPci(canvasElement);

    await step("the shares are painted on parts that cover them", async () => {
      await waitFor(() => expect(fills(root)).toEqual([RED, BLUE, RED, RED, RED, RED]));
      expect(pci.getResponse()).toEqual(response([{ color: BLUE, percentage: 25 }, { color: RED, percentage: 75 }]));
    });

    await step("a response no colouring of the shape can give empties it", async () => {
      pci.setResponse(response([{ color: RED, percentage: 33 }]));
      await waitFor(() => expect(fills(root)).toEqual(["#fff", "#fff", "#fff", "#fff", "#fff", "#fff"]));
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("setResponse and resetResponse", async () => {
      pci.setResponse(response([{ color: GREEN, percentage: 12.5 }]));
      await waitFor(() => expect(fills(root)).toEqual(["#fff", "#fff", GREEN, "#fff", "#fff", "#fff"]));
      pci.resetResponse();
      await waitFor(() => expect(fills(root)).toEqual(["#fff", "#fff", "#fff", "#fff", "#fff", "#fff"]));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

const correct = JSON.stringify([{ color: BLUE, percentage: 50 }, { color: RED, percentage: 25 }]);

export const SolutionShowsCorrectResponse: Story = {
  args: {
    status: "solution",
    responseDeclaration: { cardinality: "single", baseType: "string", correctResponse: { value: correct } },
  },
  play: async ({ canvasElement }) => {
    const { pci, root } = await openPci(canvasElement);
    await waitFor(() => expect(fills(root)).toEqual([BLUE, RED, "#fff", "#fff", "#fff", "#fff"]));
    // the correct response is exactly what the PCI reports for it (match_correct compares these strings)
    expect(pci.getResponse()).toEqual({ base: { string: correct } });
  },
};

export const CorrectResponseOnlyInSolution: Story = {
  args: {
    status: "interacting",
    responseDeclaration: { cardinality: "single", baseType: "string", correctResponse: { value: correct } },
  },
  play: async ({ canvasElement }) => {
    const { pci, root } = await openPci(canvasElement);
    await waitFor(() => expect(fills(root)).toEqual(["#fff", "#fff", "#fff", "#fff", "#fff", "#fff"]));
    expect(pci.getResponse()).toBeUndefined();
    // the delivery system moves the running interaction into review
    pci.showCorrectResponse();
    await waitFor(() => expect(fills(root)).toEqual([BLUE, RED, "#fff", "#fff", "#fff", "#fff"]));
  },
};

// ---- Authoring mode: getAuthoringInstance, as an authoring system calls it ----

export const Authoring: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  play: async ({ canvasElement, step }) => {
    const { instance, changes, root, canvas } = await openAuthoring(canvasElement);

    await step("starts with the standard shape", async () => {
      expect(canvas.getByRole("img", { name: "Shape to colour: 6 parts" })).toBeInTheDocument();
      expect(instance.validate()).toEqual([]);
      expect(JSON.parse(instance.getProperties().partition)).toEqual({
        width: 512, height: 768, snap: 8,
        lines: [[0, 8, 16, 8], [8, 8, 8, 16], [8, 12, 16, 12], [12, 12, 12, 16], [12, 14, 16, 14]],
      });
    });

    await step("without lines the shape cannot be used", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove all lines" }));
      await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("1 part"));
      expect(instance.validate()).toEqual(["Draw at least one line that splits the rectangle into parts."]);
      expect(JSON.parse(instance.getProperties().partition).lines).toEqual([]);
      expect(changes.length).toBe(1);
    });

    await step("a line dragged down the middle splits it in halves", async () => {
      const frame = root.querySelector('[data-testid="authoring-shape"] g[transform] > rect')!.getBoundingClientRect();
      const svg = canvas.getByTestId("authoring-shape");
      const x = frame.left + frame.width / 2;
      await userEvent.pointer([
        { keys: "[MouseLeft>]", target: svg, coords: { clientX: x, clientY: frame.top + 4 } },
        { target: svg, coords: { clientX: x + 3, clientY: frame.top + frame.height / 2 } },
        { target: svg, coords: { clientX: x + 2, clientY: frame.bottom - 4 } },
        { keys: "[/MouseLeft]", target: svg, coords: { clientX: x + 2, clientY: frame.bottom - 4 } },
      ]);
      await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("2 parts"));
      expect(JSON.parse(instance.getProperties().partition).lines).toEqual([[8, 0, 8, 16]]);
      expect(instance.validate()).toEqual([]);
      expect(canvas.getAllByText("1/2")).toHaveLength(2);
    });

    await step("undo takes the line away again", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("1 part"));
      expect(JSON.parse(instance.getProperties().partition).lines).toEqual([]);
    });

    await step("the size of the rectangle", async () => {
      const width = canvas.getByTestId("width") as HTMLInputElement;
      // typed key by key: nothing changes until the author is done
      await retype(width, "300");
      expect(width).toHaveValue(300);
      expect(JSON.parse(instance.getProperties().partition).width).toBe(512);
      await userEvent.keyboard("{Enter}");
      // rounded to the paper's squares of 32
      await waitFor(() => expect(JSON.parse(instance.getProperties().partition).width).toBe(288));
      expect(width).toHaveValue(288);
      // within the limits, and shown as it counts
      await retype(width, "5000");
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(JSON.parse(instance.getProperties().partition).width).toBe(1024));
      expect(width).toHaveValue(1024);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { partition: JSON.stringify({ width: 512, height: 512, snap: 4, lines: [[0, 8, 16, 8], [8, 0, 8, 4]] }) } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    // the short line ends in the open: it splits nothing
    await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("2 delen1 lijn verdeelt niets en wordt niet aan de kandidaat getoond."));
    await userEvent.click(canvas.getByRole("button", { name: "Alle lijnen verwijderen" }));
    expect(instance.validate()).toEqual(["Teken minstens één lijn die de rechthoek in delen verdeelt."]);
    await userEvent.click(canvas.getByRole("button", { name: "Standaardvorm" }));
    await waitFor(() => expect(canvas.getByTestId("summary")).toHaveTextContent("6 delen"));
  },
};
