// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Greenhouse effect",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** The fields of the record response, as { name: value }. */
const fields = (mounted: MountedPci) => {
  const response = mounted.pci.getResponse();
  if (!response) return undefined;
  return Object.fromEntries(response.record.map((f: any) => [f.name, Object.values(f.base)[0]]));
};
/** Drags the slider to a value and lets go: the picture follows while dragging (input), the value goes in on release (change). */
const slide = async (slider: HTMLElement, value: number) => {
  (slider as HTMLInputElement).value = String(value);
  fireEvent.input(slider);
  fireEvent.change(slider);
  await afterPaint();
};
const width = (root: MountedPci["root"], key: string) => Number(root.querySelector(`[data-testid="arrow-${key}"]`)?.getAttribute("data-width") ?? 0);

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;

    await step("78 % of the surface infrared absorbed: 14.9 °C, the flows in W/m²", async () => {
      expect(canvas.getByRole("region", { name: "Greenhouse effect simulation" })).toBeInTheDocument();
      expect(canvas.getByTestId("temperature")).toHaveTextContent("14.9 °C");
      expect(canvas.getByRole("slider", { name: "Greenhouse gases" })).toHaveAttribute("aria-valuetext", "78%, 14.9 °C");
      expect(canvas.getByTestId("absorbed")).toHaveTextContent("The atmosphere absorbs 78% of the surface infrared");
      expect(canvas.getByTestId("label-incoming")).toHaveTextContent("Sunlight340 W/m²");
      expect(canvas.getByTestId("label-backRadiation")).toHaveTextContent("Back to the surfacegreenhouse effect152 W/m²");
      expect(canvas.getByRole("img", { name: /the atmosphere sends 152 W\/m² back to the surface/ })).toBeInTheDocument();
      expect(canvas.getByRole("img", { name: "Thermometer: 14.9 °C" })).toBeInTheDocument();
      expect(canvas.getByRole("table")).toHaveTextContent("Infrared radiated by the warm surface390115%");
      // the classic model: no sunlight absorbed in the air
      expect(root.querySelector('[data-testid="arrow-solarAtmosphere"]')).toBeNull();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("more greenhouse gas: warmer, a wider arrow back to the surface, a narrower window", async () => {
      const back = width(root, "backRadiation");
      const window = width(root, "window");
      await userEvent.click(canvas.getByRole("button", { name: "More greenhouse gas" }));
      expect(canvas.getByTestId("temperature")).toHaveTextContent("15.5 °C");
      expect(width(root, "backRadiation")).toBeGreaterThan(back);
      expect(width(root, "window")).toBeLessThan(window);
      expect(canvas.getByRole("status")).toHaveTextContent("Greenhouse gases 79%: surface temperature 15.5 °C.");
      expect(fields(mounted)).toEqual({ level: 79, epsilon: 0.79, temperature: 15.5, tried: '[{"level":79,"temperature":15.5}]' });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("arrow widths are proportional to the flows: no greenhouse gas, no back radiation, −18.6 °C", async () => {
      await slide(canvas.getByRole("slider", { name: "Greenhouse gases" }), 0);
      expect(canvas.getByTestId("temperature")).toHaveTextContent("−18.6 °C");
      expect(root.querySelector('[data-testid="arrow-backRadiation"]')).toBeNull();
      expect(width(root, "window")).toBeCloseTo(width(root, "surfaceInfrared"));
      expect(width(root, "incoming") / width(root, "reflected")).toBeCloseTo(1 / 0.3, 1);
      expect(root.querySelector('[data-testid="molecules"]')).toHaveAttribute("data-count", "0");
      expect(JSON.parse(fields(mounted)!.tried as string)).toEqual([{ level: 79, temperature: 15.5 }, { level: 0, temperature: -18.6 }]);
    });
  },
};

export const TargetQuestion: Story = {
  args: { properties: { question: "target", targetTemperature: "20", tolerance: "0.5" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the target is in the task and on the thermometer", async () => {
      expect(canvas.getByTestId("target")).toHaveTextContent("Set the amount of greenhouse gas so that the surface temperature is 20.0 °C (± 0.5 °C).");
      expect(canvas.getByTestId("target-mark")).toBeInTheDocument();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("19.2 °C is not close enough", async () => {
      await slide(canvas.getByRole("slider", { name: "Greenhouse gases" }), 85);
      expect(fields(mounted)).toMatchObject({ level: 85, temperature: 19.2, correct: 0, score: 0 });
    });

    await step("19.8 °C is", async () => {
      await slide(canvas.getByRole("slider", { name: "Greenhouse gases" }), 86);
      expect(fields(mounted)).toMatchObject({ level: 86, temperature: 19.8, correct: 1, score: 1 });
      expect(JSON.parse(fields(mounted)!.tried as string).map((t: any) => t.level)).toEqual([85, 86]);
    });
  },
};

export const DirectionQuestion: Story = {
  args: { properties: { question: "direction", direction: "more" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    const slider = () => canvas.getByRole("slider", { name: "Greenhouse gases" });

    await step("the slider waits for the prediction", async () => {
      expect(canvas.getByRole("group", { name: /more greenhouse gas/ })).toBeInTheDocument();
      expect(slider()).toBeDisabled();
      expect(canvas.getByRole("button", { name: "More greenhouse gas" })).toBeDisabled();
    });

    await step("a prediction unlocks the slider; it is the response", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "It stays the same" }));
      expect(slider()).toBeEnabled();
      expect(fields(mounted)).toMatchObject({ prediction: "same", correct: 0, score: 0, tried: "[]" });
      await userEvent.click(canvas.getByRole("radio", { name: "It rises" }));
      expect(fields(mounted)).toMatchObject({ prediction: "up", correct: 1, score: 1 });
    });

    await step("once the candidate tries it out, the prediction is fixed", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "More greenhouse gas" }));
      expect(canvas.getByRole("radio", { name: "It falls" })).toBeDisabled();
      expect(canvas.getByTestId("predict-hint")).toHaveTextContent("Your prediction is fixed now.");
      expect(fields(mounted)).toMatchObject({ prediction: "up", level: 79, correct: 1 });
    });
  },
};

export const NumbersAndUnits: Story = {
  args: { properties: { numbers: "percent", temperatureUnit: "both", atmosphereSolar: "0.2", showTable: "false", showLevel: "false", startLevel: "95" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    // 20 % of the sunlight absorbed in the air, as in the original diagram: 30 / 20 / 50 %
    expect(canvas.getByTestId("label-reflected")).toHaveTextContent("Reflected30%");
    expect(canvas.getByTestId("label-solarAtmosphere")).toHaveTextContent("Absorbed by the air20%");
    expect(canvas.getByTestId("label-solarSurface")).toHaveTextContent("Absorbed by thesurface50%");
    expect(root.querySelector('[data-testid="arrow-solarAtmosphere"]')).not.toBeNull();
    expect(canvas.getByTestId("temperature")).toHaveTextContent(/^[\d.]+ °C \([\d.]+ K\)$/);
    expect(canvas.queryByRole("table")).toBeNull();
    expect(canvas.queryByTestId("absorbed")).toBeNull();
  },
};

export const HiddenNumbers: Story = {
  args: { properties: { numbers: "none", showTemperature: "false", showTable: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByTestId("label-incoming")).toHaveTextContent(/^Sunlight$/);
    expect(canvas.queryByTestId("temperature")).toBeNull();
    expect(canvas.getByRole("img", { name: "Surface temperature" })).toBeInTheDocument();
    // the screen reader does not get the temperature either
    expect(canvas.getByRole("slider", { name: "Greenhouse gases" })).toHaveAttribute("aria-valuetext", "78%");
  },
};

export const French: Story = {
  args: { properties: { language: "fr", question: "target", targetTemperature: "10" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Simulation de l'effet de serre" })).toBeInTheDocument();
    expect(canvas.getByTestId("temperature")).toHaveTextContent("14,9 °C");
    expect(canvas.getByTestId("target")).toHaveTextContent("Règle la quantité de gaz à effet de serre pour que la température de la surface soit de 10,0 °C (± 0,5 °C).");
    expect(canvas.getByTestId("label-backRadiation")).toHaveTextContent("Renvoyée vers le sol");
    await userEvent.click(canvas.getByRole("button", { name: "Moins de gaz à effet de serre" }));
    expect(canvas.getByRole("status")).toHaveTextContent(/^Gaz à effet de serre 77\s% : température de la surface 14,3 °C\.$/);
    // the response does not depend on the language
    expect(fields(mounted)).toMatchObject({ level: 77, temperature: 14.3, correct: 0 });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", question: "direction", direction: "less", predictFirst: "false" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Simulatie van het broeikaseffect" })).toBeInTheDocument();
    expect(canvas.getByRole("group", { name: /minder broeikasgas/ })).toBeInTheDocument();
    // without predictFirst the slider is free and the prediction stays open
    await slide(canvas.getByRole("slider", { name: "Broeikasgassen" }), 60);
    expect(canvas.getByTestId("temperature")).toHaveTextContent("5,2 °C");
    await userEvent.click(canvas.getByRole("radio", { name: "Die daalt" }));
    expect(canvas.getByRole("radio", { name: "Die stijgt" })).toBeEnabled();
    expect(fields(mounted)).toMatchObject({ level: 60, temperature: 5.2, prediction: "down", correct: 1 });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "More greenhouse gas" }));
    await userEvent.click(first.canvas.getByRole("button", { name: "More greenhouse gas" }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ level: 80, tried: [79, 80], prediction: null });

    const second = await remountPci(canvasElement, pci, { state });
    expect(second.canvas.getByRole("slider", { name: "Greenhouse gases" })).toHaveValue("80");
    expect(second.canvas.getByTestId("temperature")).toHaveTextContent("16.1 °C");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

const BOUND = {
  record: [
    { name: "level", base: { float: 50 } },
    { name: "temperature", base: { float: 0.4 } },
    { name: "tried", base: { string: '[{"level":90,"temperature":22.4},{"level":50,"temperature":0.4}]' } },
  ],
};

export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: BOUND } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    await waitFor(() => expect(canvas.getByRole("slider", { name: "Greenhouse gases" })).toHaveValue("50"));
    expect(canvas.getByRole("slider", { name: "Greenhouse gases" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "More greenhouse gas" })).toBeDisabled();
    expect(canvas.getByTestId("temperature")).toHaveTextContent("0.4 °C");
    expect(JSON.parse(fields(mounted)!.tried as string).map((t: any) => t.level)).toEqual([90, 50]);
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { question: "target", targetTemperature: "20" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    // the level whose temperature is closest to the target
    await waitFor(() => expect(canvas.getByRole("slider", { name: "Greenhouse gases" })).toHaveValue("86"));
    expect(fields(mounted)).toMatchObject({ level: 86, correct: 1, score: 1 });
  },
};

export const ResetResponse: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await slide(canvas.getByRole("slider", { name: "Greenhouse gases" }), 40);
    pci.resetResponse();
    await afterPaint(); // the reset shows after Preact's next render
    expect(canvas.getByRole("slider", { name: "Greenhouse gases" })).toHaveValue("78");
    expect(pci.getResponse()).toBeUndefined();
  },
};
