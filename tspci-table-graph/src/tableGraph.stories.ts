import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, retype, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Table and graph",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** The x values in the table, top to bottom (the newest first). */
const tableValues = (root: ShadowRoot | HTMLElement) =>
  [...root.querySelectorAll("tbody button[aria-pressed]")].map((b) => b.textContent);

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("starts with the start values, and no response", async () => {
      expect(tableValues(root)).toEqual(["50", "40", "30"]);
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("a value the candidate adds is calculated with both formulas", async () => {
      await userEvent.type(canvas.getByRole("textbox"), "60");
      await userEvent.click(canvas.getByRole("button", { name: "Add" }));
      expect(tableValues(root)[0]).toBe("60");
      const row = canvas.getByRole("button", { name: "Show 60 in the graph" }).closest("tr")!;
      // 1.125 + 60 / 24 and 1.5 + 60 / 30, with 2 decimals
      expect([...row.querySelectorAll("td")].slice(1, 3).map((td) => td.textContent)).toEqual(["3.63", "3.50"]);
      expect(pci.getResponse()).toEqual({ list: { float: [30, 40, 50, 60] } });
      expect(await lastChange(mounted)).toEqual({ list: { float: [30, 40, 50, 60] } });
    });

    await step("a value is removed from the table and the response", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove 40" }));
      expect(tableValues(root)).toEqual(["60", "50", "30"]);
      expect(pci.getResponse()).toEqual({ list: { float: [30, 50, 60] } });
    });

    await step("a value is selected (and the graph shows it)", async () => {
      const value = canvas.getByRole("button", { name: "Show 50 in the graph" });
      await userEvent.click(value);
      expect(value).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(value);
      expect(value).toHaveAttribute("aria-pressed", "false");
    });
  },
};

export const Validation: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const input = canvas.getByRole("textbox");
    const add = canvas.getByRole("button", { name: "Add" });

    await userEvent.type(input, "abc");
    await userEvent.click(add);
    expect(canvas.getByRole("alert")).toHaveTextContent("Type a number, such as 10.");
    expect(input).toHaveAttribute("aria-invalid", "true");

    await retype(input, "101");
    await userEvent.click(add);
    expect(canvas.getByRole("alert")).toHaveTextContent("Type a number from 0 to 100.");

    await retype(input, "30");
    await userEvent.click(add);
    expect(canvas.getByRole("alert")).toHaveTextContent("30 is already in the table.");

    // nothing was added
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const EmptyStart: Story = {
  args: { properties: { startValues: "" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText("Add a number: its results appear in the table and in the graph.")).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox"), "12{Enter}");
    expect(pci.getResponse()).toEqual({ list: { float: [12] } });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", decimals: "1", startValues: "2,5; 7,5" } },
  play: async ({ canvasElement }) => {
    const { canvas, root, pci } = await openPci(canvasElement);
    expect(tableValues(root)).toEqual(["7,5", "2,5"]);
    await userEvent.type(canvas.getByRole("textbox"), "12,5");
    await userEvent.click(canvas.getByRole("button", { name: "Voeg toe" }));
    expect(pci.getResponse()).toEqual({ list: { float: [2.5, 7.5, 12.5] } });
    const row = canvas.getByRole("button", { name: "12,5 in de grafiek aanwijzen" }).closest("tr")!;
    // 1.125 + 12.5 / 24 = 1.646 → 1,6
    expect(row.querySelectorAll("td")[1]).toHaveTextContent("1,6");
  },
};

export const InvalidFormula: Story = {
  args: { properties: { formula2: "1.5 + * x" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByText(/"height of the pine" cannot be calculated/)).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Show 30 in the graph" }).closest("tr")!.querySelectorAll("td")[2]).toHaveTextContent("–");
  },
};

export const Review: Story = {
  args: { status: "review" },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    expect(canvas.getByRole("textbox")).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Add" })).toBeDisabled();
    // the remove buttons are hidden as well
    const removes = root.querySelectorAll('button[aria-label^="Remove"]');
    expect(removes).toHaveLength(3);
    for (const remove of removes) expect(remove).not.toBeVisible();
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.type(first.canvas.getByRole("textbox"), "75{Enter}");
    await userEvent.click(first.canvas.getByRole("button", { name: "Remove 30" }));
    const state = first.pci.getState();

    const second = await remountPci(canvasElement, pci, { state });
    expect(tableValues(second.root)).toEqual(["75", "50", "40"]);
    expect(second.pci.getResponse()).toEqual({ list: { float: [40, 50, 75] } });
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { list: { float: [5, 15] } } } },
  play: async ({ canvasElement }) => {
    const { root, pci } = await openPci(canvasElement);
    await waitFor(() => expect(tableValues(root)).toEqual(["15", "5"]));
    pci.resetResponse();
    await waitFor(() => expect(tableValues(root)).toEqual(["50", "40", "30"]));
  },
};
