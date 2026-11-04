// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent } from "storybook/test";
import { afterPaint, lastChange, mountPci, openPci, remountPci, retype, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Bronchiole",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** The fields of a record response, as { name: value }. */
const fields = (response: any) =>
  Object.fromEntries((response?.record ?? []).map((f: any) => [f.name, Object.values(f.base ?? {})[0]]));
/** Drags the slider to a level and lets go. */
const slide = async (slider: HTMLElement, value: number) => {
  (slider as HTMLInputElement).value = String(value);
  fireEvent.input(slider);
  fireEvent.change(slider);
  await afterPaint();
};
const text = (canvas: MountedPci["canvas"], testid: string) => canvas.getByTestId(testid).textContent!.replace(/\s+/g, " ").trim();

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("two cross-sections at the lowest pollution; nothing to report yet", async () => {
      expect(canvas.getByRole("region", { name: "Pollution and the bronchioles" })).toBeInTheDocument();
      expect(canvas.getByText("Healthy person")).toBeInTheDocument();
      expect(canvas.getByText("Person with asthma")).toBeInTheDocument();
      expect(canvas.getByRole("img", { name: /^Cross-section of the bronchiole of the healthy person: the air passage is 100% of normal/ })).toBeInTheDocument();
      const slider = canvas.getByRole("slider", { name: "Air pollution" });
      expect(slider).toHaveValue("1");
      expect(slider).toHaveAttribute("aria-valuetext", "level 1 of 20");
      expect(text(canvas, "flow-asthmatic")).toBe("90% of normal");
      expect(text(canvas, "area-asthmatic")).toBe("95% of normal");
      expect(canvas.getAllByRole("meter")).toHaveLength(4);
      expect(canvas.getByTestId("flow-note")).toHaveTextContent("Poiseuille");
      expect(canvas.queryByTestId("question")).toBeNull();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("one step more pollution with the + button", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "More pollution" }));
      expect(canvas.getByRole("slider", { name: "Air pollution" })).toHaveValue("2");
      expect(text(canvas, "flow-asthmatic")).toBe("81% of normal");
      expect(canvas.getByRole("status")).toHaveTextContent(
        "Pollution level 2 of 20. Healthy person: air passage 99%, airflow 98%. Person with asthma: air passage 90%, airflow 81%."
      );
      expect(fields(pci.getResponse())).toEqual({
        pollution: 2, healthyArea: 98.95, healthyFlow: 97.91, asthmaticArea: 90.25, asthmaticFlow: 81.45, levels: "1,2",
      });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("dragged to the highest level: half the radius, a quarter of the area, 1/16 of the airflow", async () => {
      await slide(canvas.getByRole("slider", { name: "Air pollution" }), 20);
      expect(text(canvas, "area-asthmatic")).toBe("25% of normal");
      expect(text(canvas, "flow-asthmatic")).toBe("6% of normal");
      expect(text(canvas, "flow-healthy")).toBe("66% of normal");
      const lumen = canvas.getAllByTestId("cross-section")[1].querySelector("[data-part=lumen]")!;
      expect(lumen.getAttribute("data-radius")).toBe("24.00");
      expect(canvas.getByRole("button", { name: "More pollution" })).toBeDisabled();
      expect(fields(pci.getResponse())).toMatchObject({ pollution: 20, asthmaticFlow: 6.25, levels: "1,2,20" });
    });

    await step("back with the keyboard: the log keeps every level the candidate stopped at", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Less pollution" }));
      expect(fields(pci.getResponse())).toMatchObject({ pollution: 19, levels: "1,2,20,19" });
    });
  },
};

export const OneAirwayAndOwnLabels: Story = {
  args: { properties: { persons: "asthmatic", labelLess: "Clean air", labelMore: "Smog", decimals: "1", showArea: "false", pollutionMax: "10", pollutionStart: "5" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.queryByTestId("airway-healthy")).toBeNull();
    expect(canvas.getByTestId("airway-asthmatic")).toBeInTheDocument();
    expect(canvas.queryByTestId("area-asthmatic")).toBeNull();
    expect(canvas.getByRole("slider", { name: "Air pollution" })).toHaveAttribute("aria-valuetext", "level 5 of 10");
    expect(canvas.getByText("− Clean air")).toBeInTheDocument();
    // level 5 of 1–10: 2.5 % + 47.5 % · 4/9 = 23.6 % narrower, airflow 34.1 %
    expect(text(canvas, "flow-asthmatic")).toBe("34.1% of normal");
    await userEvent.click(canvas.getByRole("button", { name: "Smog" }));
    const response = fields(pci.getResponse());
    expect(response.pollution).toBe(6);
    expect(response.levels).toBe("5,6");
    expect(response.healthyFlow).toBeUndefined();
  },
};

const THRESHOLD = { question: "threshold", questionPerson: "asthmatic", questionQuantity: "flow", questionPercent: "50", points: "2" };

export const ThresholdQuestion: Story = {
  args: { properties: THRESHOLD },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const answer = canvas.getByRole("textbox", {
      name: "From which pollution level on is the airflow in the bronchiole of the person with asthma less than 50% of normal?",
    });

    await step("a wrong answer: scored 0", async () => {
      await userEvent.type(answer, "6");
      expect(fields(pci.getResponse())).toMatchObject({ pollution: 1, levels: "1", answer: 6, correct: 0, score: 0, maxscore: 2 });
    });

    await step("the candidate finds the level with the slider and corrects the answer", async () => {
      await slide(canvas.getByRole("slider", { name: "Air pollution" }), 7);
      expect(text(canvas, "flow-asthmatic")).toBe("46% of normal");
      await retype(answer, "7");
      expect(fields(pci.getResponse())).toMatchObject({ pollution: 7, levels: "1,7", answer: 7, correct: 1, score: 2, maxscore: 2 });
      expect(fields(await lastChange(mounted))).toMatchObject({ correct: 1 });
    });
  },
};

export const RatioQuestionFrench: Story = {
  args: { properties: { question: "ratio", persons: "asthmatic", language: "fr", decimals: "1" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // a comparison shows both airways, whatever the setting
    expect(canvas.getByText("Individu en bonne santé")).toBeInTheDocument();
    expect(canvas.getByText("Individu asthmatique")).toBeInTheDocument();
    expect(canvas.getByRole("slider", { name: "Pollution de l'air" })).toHaveAttribute("aria-valuetext", "niveau 1 sur 20");
    await slide(canvas.getByRole("slider", { name: "Pollution de l'air" }), 20);
    expect(text(canvas, "flow-asthmatic")).toBe("6,3 % de la normale");
    expect(text(canvas, "flow-healthy")).toBe("65,6 % de la normale");
    const answer = canvas.getByRole("textbox", { name: /^Au niveau de pollution 20, combien de fois le débit d'air/ });
    await userEvent.type(answer, "10,5");
    // a decimal comma on the screen; a number in the response
    expect(fields(pci.getResponse())).toMatchObject({ pollution: 20, answer: 10.5, correct: 1, score: 1 });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", decimals: "1", question: "threshold", questionQuantity: "area" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("region", { name: "Luchtvervuiling en de bronchiolen" })).toBeInTheDocument();
    expect(canvas.getByText("Persoon met astma")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Meer vervuiling" }));
    expect(text(canvas, "flow-asthmatic")).toBe("81,5% van normaal");
    expect(canvas.getByRole("status")).toHaveTextContent("Vervuiling niveau 2 van 20. Gezonde persoon: luchtdoorgang 99,0%, luchtstroom 97,9%.");
    await userEvent.type(canvas.getByRole("textbox", { name: /^Vanaf welk vervuilingsniveau is de luchtdoorgang/ }), "12");
    expect(fields(pci.getResponse())).toMatchObject({ answer: 12, correct: 1 });
  },
};

export const RestoresState: Story = {
  args: { properties: THRESHOLD },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "More pollution" }));
    await userEvent.click(first.canvas.getByRole("button", { name: "More pollution" }));
    await userEvent.type(first.canvas.getByRole("textbox"), "8");
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ level: 3, levels: [1, 2, 3], answer: "8" });

    const second = await remountPci(canvasElement, pci, { properties: THRESHOLD, state });
    expect(second.canvas.getByRole("slider", { name: "Air pollution" })).toHaveValue("3");
    expect(second.canvas.getByRole("textbox")).toHaveValue("8");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: {
    properties: THRESHOLD,
    boundTo: { RESPONSE: { record: [
      { name: "pollution", base: { integer: 12 } },
      { name: "levels", base: { string: "1,20,12" } },
      { name: "answer", base: { float: 7 } },
    ] } },
  },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response sets the slider, the log and the answer; the rest follows from them", async () => {
      expect(canvas.getByRole("slider", { name: "Air pollution" })).toHaveValue("12");
      expect(canvas.getByRole("textbox")).toHaveValue("7");
      expect(fields(pci.getResponse())).toMatchObject({ pollution: 12, asthmaticArea: 49, levels: "1,20,12", answer: 7, correct: 1 });
    });
    await step("resetResponse goes back to the start", async () => {
      pci.resetResponse();
      await afterPaint(); // the reset shows after Preact's next render
      expect(canvas.getByRole("slider", { name: "Air pollution" })).toHaveValue("1");
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Review: Story = {
  args: {
    properties: THRESHOLD,
    status: "review",
    state: JSON.stringify({ state: { level: 9, levels: [1, 9], answer: "9" }, log: [] }),
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("slider", { name: "Air pollution" })).toBeDisabled();
    expect(canvas.getByRole("slider", { name: "Air pollution" })).toHaveValue("9");
    expect(canvas.getByRole("button", { name: "More pollution" })).toBeDisabled();
    expect(canvas.getByRole("textbox")).toBeDisabled();
    expect(fields(pci.getResponse())).toMatchObject({ pollution: 9, answer: 9, correct: 0 });
  },
};

export const Solution: Story = {
  args: { properties: { question: "ratio" }, status: "solution" },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct answer, with the slider at the level of the question
    expect(canvas.getByRole("textbox")).toHaveValue("10.50");
    expect(canvas.getByRole("slider", { name: "Air pollution" })).toHaveValue("20");
    expect(fields(pci.getResponse())).toMatchObject({ pollution: 20, answer: 10.5, correct: 1 });
  },
};

/** Two interactions in one item: each has its own store and settings. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const [name, args] of [["first", {}], ["second", { properties: { language: "nl", persons: "healthy" } }]] as const) {
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
    await userEvent.click(first.canvas.getByRole("button", { name: "More pollution" }));
    await slide(second.canvas.getByRole("slider", { name: "Luchtvervuiling" }), 20);
    expect(fields(first.pci.getResponse())).toMatchObject({ pollution: 2, levels: "1,2" });
    expect(fields(second.pci.getResponse())).toEqual({ pollution: 20, healthyArea: 81, healthyFlow: 65.61, levels: "1,20" });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};
