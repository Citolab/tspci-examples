// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Bee colony",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "Pesticides and the Asian hornet are two causes of the disappearance of bees. Move the sliders and watch what happens to the hive.";

/** Moves a slider to a level, as dragging it does. */
const slide = async (slider: HTMLElement, value: number) => {
  (slider as HTMLInputElement).value = String(value);
  fireEvent.input(slider);
  fireEvent.change(slider);
  await afterPaint();
};
/** A field of the record response, by name. */
const field = (mounted: MountedPci, name: string) => {
  const item = mounted.pci.getResponse()?.record?.find((f: any) => f.name === name);
  return item ? item.base.integer ?? item.base.string : undefined;
};
/** Text with every kind of space as a plain space (fr: 80 000 with a narrow no-break space). */
const plain = (el: Element) => el.textContent!.replace(/[\s  ]+/g, " ").trim();
const scene = (mounted: MountedPci) => mounted.canvas.getByTestId("scene");

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a full hive: 80,000 bees, 8 bees drawn, all flowers", async () => {
      expect(canvas.getByText(PROMPT)).toBeInTheDocument();
      expect(canvas.getByRole("region", { name: "Bee colony simulation" })).toBeInTheDocument();
      expect(canvas.getByTestId("population")).toHaveTextContent("Hive population: 80,000 bees");
      expect(canvas.getByRole("img", { name: /8 bees fly around it\. The meadow is full of flowers\.$/ })).toBeInTheDocument();
      expect(scene(mounted)).toHaveAttribute("data-bees", "8");
      expect(scene(mounted)).toHaveAttribute("data-flowers", "4");
      expect(canvas.getByRole("slider", { name: "Amount of pesticide" })).toHaveAttribute("aria-valuetext", "level 0 of 2, Hive population: 80,000 bees");
      expect(canvas.getByRole("slider", { name: "Asian hornet" })).toHaveValue("0");
      expect(canvas.queryByRole("slider", { name: "Varroa mite" })).toBeNull();
      expect(canvas.queryByTestId("question")).toBeNull();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("pesticide at 1: 60,000 bees, 6 drawn, a group of flowers gone", async () => {
      await slide(canvas.getByRole("slider", { name: "Amount of pesticide" }), 1);
      expect(canvas.getByTestId("population")).toHaveTextContent("Hive population: 60,000 bees");
      expect(scene(mounted)).toHaveAttribute("data-bees", "6");
      expect(scene(mounted)).toHaveAttribute("data-flowers", "3");
      expect(canvas.getByRole("status")).toHaveTextContent("Hive population: 60,000 bees");
      expect(field(mounted, "pesticide")).toBe(1);
      expect(field(mounted, "population")).toBe(60000);
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("the hornet at 2 as well: 20,000 bees, one group of flowers, two hornets, one flies across", async () => {
      await slide(canvas.getByRole("slider", { name: "Asian hornet" }), 2);
      expect(canvas.getByTestId("population")).toHaveTextContent("Hive population: 20,000 bees");
      expect(scene(mounted)).toHaveAttribute("data-flowers", "1");
      expect(scene(mounted)).toHaveAttribute("data-hornets", "2");
      // a hornet flies across, unless the candidate asked for less motion
      if (scene(mounted).dataset.motion === "full") await waitFor(() => expect(canvas.getByTestId("hornet-flight")).toBeInTheDocument());
      expect(canvas.getByRole("img", { name: /2 Asian hornets hunt at the hive\./ })).toBeInTheDocument();
    });

    await step("both at 2: an empty hive", async () => {
      await slide(canvas.getByRole("slider", { name: "Amount of pesticide" }), 2);
      expect(canvas.getByTestId("population")).toHaveTextContent("Hive population: 0 bees");
      expect(scene(mounted)).toHaveAttribute("data-bees", "0");
      expect(scene(mounted)).toHaveAttribute("data-flowers", "0");
    });

    await step("every move is in the response, as the original logged it", async () => {
      expect(JSON.parse(field(mounted, "history"))).toEqual([
        { pesticide: 1, hornet: 0 },
        { pesticide: 1, hornet: 2 },
        { pesticide: 2, hornet: 2 },
      ]);
      expect(field(mounted, "maxscore")).toBe(0);
      expect(field(mounted, "answer")).toBeUndefined();
    });
  },
};

export const RecordTrials: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    const table = () => canvas.getByRole("table", { name: "Your trials" });

    await step("an empty table", async () => {
      expect(table()).toHaveTextContent("No trials yet");
    });

    await step("record the start and pesticide at 2", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Record trial" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Trial 1 recorded: 80,000 bees.");
      await slide(canvas.getByRole("slider", { name: "Amount of pesticide" }), 2);
      await userEvent.click(canvas.getByRole("button", { name: "Record trial" }));
      const rows = table().querySelectorAll("tbody tr");
      expect(rows).toHaveLength(2);
      expect([...rows[1].querySelectorAll("th, td")].map((c) => c.textContent)).toEqual(["2", "2", "0", "40,000", ""]);
      expect(JSON.parse(field(mounted, "trials"))).toEqual([
        { pesticide: 0, hornet: 0, population: 80000 },
        { pesticide: 2, hornet: 0, population: 40000 },
      ]);
    });

    await step("the same combination twice is not a new row", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Record trial" }));
      expect(canvas.getByRole("status")).toHaveTextContent("This combination is already in the table (trial 2).");
      expect(table().querySelectorAll("tbody tr")).toHaveLength(2);
    });

    await step("remove a row", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove trial 1" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Trial 1 removed.");
      expect(JSON.parse(field(mounted, "trials"))).toEqual([{ pesticide: 2, hornet: 0, population: 40000 }]);
    });
  },
};

export const TableFull: Story = {
  args: { properties: { maxTrials: "1" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Record trial" }));
    await slide(canvas.getByRole("slider", { name: "Asian hornet" }), 1);
    await userEvent.click(canvas.getByRole("button", { name: "Record trial" }));
    expect(canvas.getByRole("status")).toHaveTextContent("The table is full: remove a trial first.");
  },
};

export const OwnModelWithVarroa: Story = {
  args: {
    properties: {
      startPopulation: "50000",
      beesPerIcon: "2500",
      pesticideLevels: "3",
      pesticideEffect: "5000;10000;15000",
      hornetEffect: "8000",
      varroa: "true",
      varroaLevels: "1",
      varroaEffect: "12000",
      showTable: "false",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("three sliders, the author's start, 20 bees drawn, no table", async () => {
      expect(canvas.getByTestId("population")).toHaveTextContent("Hive population: 50,000 bees");
      expect(scene(mounted)).toHaveAttribute("data-bees", "20");
      expect(canvas.getByRole("slider", { name: "Amount of pesticide" })).toHaveAttribute("max", "3");
      expect(canvas.getByRole("slider", { name: "Varroa mite" })).toHaveAttribute("max", "1");
      expect(canvas.queryByRole("table")).toBeNull();
      expect(canvas.queryByRole("button", { name: "Record trial" })).toBeNull();
    });

    await step("the effect of each level: 5000, then 10000 more", async () => {
      await slide(canvas.getByRole("slider", { name: "Amount of pesticide" }), 2);
      expect(canvas.getByTestId("population")).toHaveTextContent("Hive population: 35,000 bees");
      await slide(canvas.getByRole("slider", { name: "Varroa mite" }), 1);
      expect(canvas.getByTestId("population")).toHaveTextContent("Hive population: 23,000 bees");
      expect(canvas.getByRole("img", { name: /Varroa mites crawl on the hive\./ })).toBeInTheDocument();
      expect(field(mounted, "varroa")).toBe(1);
    });
  },
};

export const LargestEffect: Story = {
  args: { properties: { question: "largestEffect", hornetEffect: "30000" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("a choice between the factors", async () => {
      const group = canvas.getByRole("group", { name: "Which factor has the largest effect on the population of the hive?" });
      expect(group).toBeInTheDocument();
      expect(canvas.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["pesticide", "hornet", "equal"]);
    });

    await step("a wrong answer, then the right one", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Amount of pesticide" }));
      expect(field(mounted, "answer")).toBe("pesticide");
      expect(field(mounted, "score")).toBe(0);
      expect(field(mounted, "maxscore")).toBe(1);
      await userEvent.click(canvas.getByRole("radio", { name: "Asian hornet" }));
      expect(field(mounted, "answer")).toBe("hornet");
      expect(field(mounted, "correct")).toBe(1);
      expect(field(mounted, "score")).toBe(1);
    });
  },
};

export const PredictFrench: Story = {
  args: { properties: { language: "fr", question: "predict", predictLevels: "1;2" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("the texts of the original, in French", async () => {
      expect(plain(canvas.getByTestId("population"))).toBe("Population de la ruche : 80 000 abeilles");
      expect(canvas.getByRole("slider", { name: "Quantité de pesticide" })).toBeInTheDocument();
      expect(canvas.getByRole("slider", { name: "Frelon asiatique" })).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Noter l'essai" })).toBeInTheDocument();
    });

    await step("both at 2: 0 abeille, singular as in the original", async () => {
      await slide(canvas.getByRole("slider", { name: "Quantité de pesticide" }), 2);
      await slide(canvas.getByRole("slider", { name: "Frelon asiatique" }), 2);
      expect(plain(canvas.getByTestId("population"))).toBe("Population de la ruche : 0 abeille");
    });

    await step("a prediction typed with a space: scored against the model", async () => {
      const input = canvas.getByRole("textbox", { name: /Combien d'abeilles vivent dans la ruche avec quantité de pesticide au niveau 1 et frelon asiatique au niveau 2/ });
      await userEvent.type(input, "abc");
      expect(canvas.getByText(/Tapez un nombre entier/)).toBeInTheDocument();
      expect(field(mounted, "correct")).toBe(0);
      await userEvent.type(input, "{Backspace}{Backspace}{Backspace}20 000");
      expect(input).toHaveValue("20 000");
      expect(canvas.queryByText(/Tapez un nombre entier/)).toBeNull();
      expect(field(mounted, "answer")).toBe("20000");
      expect(field(mounted, "score")).toBe(1);
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", question: "predict", predictLevels: "2;1", answerKey: "25000", tolerance: "5000" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Simulatie van een bijenvolk" })).toBeInTheDocument();
    expect(canvas.getByTestId("population")).toHaveTextContent("Populatie van de bijenkast: 80.000 bijen");
    await slide(canvas.getByRole("slider", { name: "Aziatische hoornaar" }), 1);
    expect(canvas.getByRole("status")).toHaveTextContent("Populatie van de bijenkast: 60.000 bijen");
    await userEvent.click(canvas.getByRole("button", { name: "Proef noteren" }));
    expect(canvas.getByRole("status")).toHaveTextContent("Proef 1 genoteerd: 60.000 bijen.");
    // the author's key with a margin: 25000 ± 5000
    await userEvent.type(canvas.getByRole("textbox", { name: /Hoeveel bijen wonen er in de kast bij/ }), "21.000");
    expect(field(mounted, "answer")).toBe("21000");
    expect(field(mounted, "correct")).toBe(1);
  },
};

export const RestoresState: Story = {
  args: { properties: { question: "largestEffect" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await slide(first.canvas.getByRole("slider", { name: "Asian hornet" }), 1);
    await userEvent.click(first.canvas.getByRole("button", { name: "Record trial" }));
    await userEvent.click(first.canvas.getByRole("radio", { name: "They all have the same effect" }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({
      levels: { hornet: 1 },
      trials: [{ levels: { pesticide: 0, hornet: 1 }, population: 60000 }],
      history: [{ hornet: 1 }],
      answer: "equal",
    });

    const second = await remountPci(canvasElement, pci, { properties: { question: "largestEffect" }, state });
    expect(second.canvas.getByRole("slider", { name: "Asian hornet" })).toHaveValue("1");
    expect(second.canvas.getByTestId("population")).toHaveTextContent("60,000 bees");
    expect(second.canvas.getByRole("radio", { name: "They all have the same effect" })).toBeChecked();
    expect(second.canvas.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
    // a restored state does not send a hornet across
    expect(second.canvas.queryByTestId("hornet-flight")).toBeNull();
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: {
    boundTo: {
      RESPONSE: {
        record: [
          { name: "pesticide", base: { integer: 2 } },
          { name: "hornet", base: { integer: 1 } },
          { name: "population", base: { integer: 20000 } },
          { name: "trials", base: { string: '[{"pesticide":2,"hornet":1,"population":20000}]' } },
          { name: "history", base: { string: '[{"pesticide":2,"hornet":0},{"pesticide":2,"hornet":1}]' } },
        ],
      },
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the bound response sets the sliders and the table", async () => {
      expect(canvas.getByRole("slider", { name: "Amount of pesticide" })).toHaveValue("2");
      expect(canvas.getByTestId("population")).toHaveTextContent("20,000 bees");
      expect(JSON.parse(field(mounted, "history"))).toHaveLength(2);
      expect(canvas.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(1);
    });

    await step("resetResponse goes back to the start", async () => {
      pci.resetResponse();
      await afterPaint(); // the reset shows after Preact's next render
      expect(canvas.getByRole("slider", { name: "Amount of pesticide" })).toHaveValue("0");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Review: Story = {
  args: {
    status: "review",
    properties: { question: "largestEffect" },
    state: JSON.stringify({ state: { levels: { pesticide: 1 }, trials: [], history: [{ pesticide: 1 }], answer: "hornet" }, log: [] }),
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci, changes } = await openPci(canvasElement);
    expect(canvas.getByRole("slider", { name: "Amount of pesticide" })).toBeDisabled();
    expect(canvas.getByRole("slider", { name: "Asian hornet" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Record trial" })).toBeDisabled();
    expect(canvas.getByRole("radio", { name: "Asian hornet" })).toBeChecked();
    expect(canvas.getByRole("radio", { name: "Asian hornet" })).toBeDisabled();
    expect(canvas.getByTestId("population")).toHaveTextContent("60,000 bees");
    expect(pci.getResponse()!.record.find((f: any) => f.name === "score").base.integer).toBe(0);
    expect(changes).toHaveLength(0);
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    properties: { question: "predict", predictLevels: "2;0" },
    state: JSON.stringify({ state: { levels: {}, trials: [], history: [], answer: "50000" }, log: [] }),
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    // the key replaces the candidate's answer
    expect(mounted.canvas.getByRole("textbox")).toHaveValue("40000");
    expect(mounted.canvas.getByRole("textbox")).toBeDisabled();
    expect(field(mounted, "correct")).toBe(1);
  },
};

/** Two interactions in one item: each has its own store and settings. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const [name, args] of [["first", {}], ["second", { properties: { language: "nl" } }]] as const) {
      const box = document.createElement("div");
      box.dataset.box = name;
      box.appendChild(mountPci(pci, args));
      page.appendChild(box);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-box=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-box=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await slide(first.canvas.getByRole("slider", { name: "Asian hornet" }), 1);
    await slide(second.canvas.getByRole("slider", { name: "Hoeveelheid bestrijdingsmiddel" }), 2);
    expect(first.canvas.getByTestId("population")).toHaveTextContent("60,000 bees");
    expect(second.canvas.getByTestId("population")).toHaveTextContent("40.000 bijen");
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};
