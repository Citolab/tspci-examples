// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/MaraisSalantpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, openPci, mountPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Evaporation",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const QUESTION = "Does the surface area of the water influence how fast it evaporates? Design a fair test and run it.";
/** The whole experiment in a second of real time. */
const FAST = { runSeconds: "1" };

/** The fields of the record response, by name. */
const fields = (mounted: MountedPci): Record<string, any> | undefined => {
  const response = mounted.pci.getResponse();
  if (!response) return undefined;
  return Object.fromEntries(response.record.map((f: any) => [f.name, f.base.integer ?? f.base.string]));
};
/** Starts the experiment and waits until it has ended. */
const runToEnd = async ({ canvas }: MountedPci, start = "Start the experiment", reset = "Reset") => {
  await userEvent.click(canvas.getByRole("button", { name: start }));
  await waitFor(() => expect(canvas.getByRole("button", { name: reset })).toBeInTheDocument());
  await waitFor(() => expect(canvas.queryByRole("button", { name: /Pause|Pauze/ })).toBeNull(), { timeout: 6000 });
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the research question, a clock and two equal containers", async () => {
      expect(canvas.getByTestId("question")).toHaveTextContent(QUESTION);
      expect(canvas.getByRole("region", { name: "Evaporation experiment" })).toBeInTheDocument();
      expect(canvas.getByTestId("time")).toHaveTextContent("0.0 h of 48 h");
      expect(canvas.getByRole("img", { name: "Container A: a tray 10 cm wide at 20 °C, with 200.0 mL of water." })).toBeInTheDocument();
      expect(canvas.getByRole("img", { name: /^Container B: a tray 10 cm wide/ })).toBeInTheDocument();
      expect(canvas.getByRole("slider", { name: "Width, Container A" })).toHaveAttribute("aria-valuetext", "10 cm");
      expect(canvas.getByRole("slider", { name: "Temperature, Container B" })).toHaveValue("20");
      expect(canvas.getByRole("checkbox", { name: "Fan on, Container A" })).not.toBeChecked();
      expect(canvas.getByTestId("salt-0-fixed")).toHaveTextContent("35 g/L (fixed)");
      expect(canvas.getByRole("radio", { name: "×1" })).toBeChecked();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("a wider container B: the design is a fair test of the surface, not run yet", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Width, Container B higher" }));
      expect(canvas.getByRole("slider", { name: "Width, Container B" })).toHaveValue("15");
      expect(canvas.getByTestId("container-1")).toHaveTextContent("surface 150 cm²");
      expect(fields(mounted)).toMatchObject({ score: 0, fairTest: 1, ran: 0, varied: "area", runCount: 0 });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });
  },
};

export const FairTest: Story = {
  args: { properties: FAST },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("only the width differs; run it", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Width, Container B higher" }));
      await runToEnd(mounted);
    });

    await step("the run ends when both are dry: B after 26.7 h, A after 40 h", async () => {
      expect(canvas.getByTestId("time")).toHaveTextContent("40.0 h of 48 h");
      expect(canvas.getByTestId("status-0")).toHaveTextContent("Dry after 40.0 h");
      expect(canvas.getByTestId("status-1")).toHaveTextContent("Dry after 26.7 h");
      expect(canvas.getByTestId("status-1")).toHaveTextContent("Salt crystals from 24.1 h");
      expect(canvas.getByTestId("results")).toHaveTextContent("Container B26.7 h24.1 h0.0 mL");
      expect(canvas.getAllByTestId("crystal").length).toBeGreaterThan(20);
      expect(canvas.getByRole("status")).toHaveTextContent("The experiment has ended at 40.0 h.");
      // the settings cannot change until a reset
      expect(canvas.getByRole("slider", { name: "Width, Container A" })).toBeDisabled();
      expect(canvas.getByTestId("hint")).toHaveTextContent("Reset the experiment to change the settings.");
    });

    await step("scored: a fair test of the target, and it ran", async () => {
      const f = fields(mounted)!;
      expect(f).toMatchObject({ score: 1, fairTest: 1, ran: 1, varied: "area", runCount: 1 });
      expect(JSON.parse(f.containers)).toEqual([
        { temperature: 20, width: 10, wind: false, salt: 35, volume: 200 },
        { temperature: 20, width: 15, wind: false, salt: 35, volume: 200 },
      ]);
      expect(JSON.parse(f.results)).toEqual([
        { dryAfter: 40, crystalsFrom: 36.1, volumeLeft: 0, crystals: 7 },
        { dryAfter: 26.7, crystalsFrom: 24.1, volumeLeft: 0, crystals: 7 },
      ]);
      expect(JSON.parse(f.runs)).toHaveLength(1);
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("a later unfair run does not take the point away", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
      expect(canvas.getByTestId("time")).toHaveTextContent("0.0 h of 48 h");
      await userEvent.click(canvas.getByRole("checkbox", { name: "Fan on, Container A" }));
      await runToEnd(mounted);
      expect(fields(mounted)).toMatchObject({ score: 1, runCount: 2 });
      expect(canvas.getByTestId("runs")).toHaveTextContent("Earlier runs (2)");
    });
  },
};

export const UnfairTest: Story = {
  args: { properties: FAST },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    // wider and warmer: two variables differ
    await userEvent.click(canvas.getByRole("button", { name: "Width, Container B higher" }));
    await userEvent.click(canvas.getByRole("button", { name: "Temperature, Container B higher" }));
    await runToEnd(mounted);
    expect(fields(mounted)).toMatchObject({ score: 0, fairTest: 0, ran: 1, varied: "temperature;area", runCount: 1 });
  },
};

export const ClockControls: Story = {
  args: { properties: { runSeconds: "40", width: "5", duration: "24" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("start, then pause halfway", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "×4" }));
      await userEvent.click(canvas.getByRole("button", { name: "Start the experiment" }));
      expect(canvas.getByRole("status")).toHaveTextContent("The experiment has started.");
      await waitFor(() => expect(Number(canvas.getByTestId("time").textContent!.split(" ")[0])).toBeGreaterThan(1));
      await userEvent.click(canvas.getByRole("button", { name: "Pause" }));
      const paused = canvas.getByTestId("time").textContent;
      expect(canvas.getByRole("status")).toHaveTextContent(/^Paused at \d+\.\d h\.$/);
      await new Promise((r) => setTimeout(r, 300));
      expect(canvas.getByTestId("time").textContent).toBe(paused);
      expect(canvas.getByRole("button", { name: "Continue" })).toBeInTheDocument();
      expect(JSON.parse(pci.getState()).state.phase).toBe("paused");
    });

    await step("a reset before the end logs a run that did not complete", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
      expect(canvas.getByTestId("time")).toHaveTextContent("0.0 h of 24 h");
      expect(canvas.getByRole("slider", { name: "Width, Container A" })).toBeEnabled();
      const f = fields(mounted)!;
      expect(f).toMatchObject({ ran: 0, runCount: 0 });
      const runs = JSON.parse(f.runs);
      expect(runs).toHaveLength(1);
      expect(runs[0].completed).toBe(false);
      expect(runs[0].hours).toBeGreaterThan(1);
      expect(canvas.getByTestId("runs")).toHaveTextContent(/stopped at/);
    });
  },
};

export const ThreeContainersTemperature: Story = {
  args: {
    properties: {
      ...FAST,
      count: "3",
      target: "temperature",
      question: "Does warm water evaporate faster?",
      changeWind: "false",
      changeVolume: "false",
      changeSalt: "true",
      volume: "100",
      temperatureMin: "20",
      temperatureMax: "60",
      temperatureStep: "20",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("three containers; the volume fixed, no wind, salt a slider", async () => {
      expect(canvas.getByTestId("question")).toHaveTextContent("Does warm water evaporate faster?");
      expect(canvas.getAllByTestId("tray")).toHaveLength(3);
      expect(canvas.getByTestId("volume-2-fixed")).toHaveTextContent("100 mL (fixed)");
      expect(canvas.queryByRole("checkbox")).toBeNull();
      expect(canvas.getByRole("slider", { name: "Salt, Container C" })).toHaveValue("35");
    });

    await step("20, 40 and 60 °C: a fair test of the temperature", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Temperature, Container B higher" }));
      await userEvent.click(canvas.getByRole("button", { name: "Temperature, Container C higher" }));
      await userEvent.click(canvas.getByRole("button", { name: "Temperature, Container C higher" }));
      await runToEnd(mounted);
      expect(fields(mounted)).toMatchObject({ score: 1, fairTest: 1, varied: "temperature" });
      const results = JSON.parse(fields(mounted)!.results);
      expect(results[2].dryAfter).toBeLessThan(results[1].dryAfter);
      expect(results[1].dryAfter).toBeLessThan(results[0].dryAfter);
    });
  },
};

/** The original's first experiment: the same salt water heated and at room temperature; the candidate changes nothing. */
export const OriginalDemonstration: Story = {
  args: {
    properties: {
      ...FAST,
      question: "",
      target: "none",
      changeTemperature: "false",
      changeArea: "false",
      changeWind: "false",
      changeVolume: "false",
      start: "temperature=60 | temperature=20",
      duration: "24",
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.queryByTestId("question")).toBeNull();
    expect(canvas.queryByRole("slider")).toBeNull();
    expect(canvas.getByTestId("temperature-0-fixed")).toHaveTextContent("60 °C (fixed)");
    expect(canvas.getByTestId("temperature-1-fixed")).toHaveTextContent("20 °C (fixed)");
    await runToEnd(mounted);
    expect(canvas.getByTestId("time")).toHaveTextContent("24.0 h of 24 h");
    expect(canvas.getByTestId("status-0")).toHaveTextContent("Dry after 4.7 h");
    expect(canvas.getByTestId("status-1")).toHaveTextContent("Water: 80.0 mL (40 %)");
    // without a target any fair test counts
    expect(fields(mounted)).toMatchObject({ score: 1, varied: "temperature" });
  },
};

export const French: Story = {
  args: { properties: { ...FAST, language: "fr", question: "La surface de l'eau influence-t-elle l'évaporation ?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Expérience d'évaporation" })).toBeInTheDocument();
    expect(canvas.getByText("Question de recherche")).toBeInTheDocument();
    expect(canvas.getByTestId("time")).toHaveTextContent("0,0 h sur 48 h");
    await userEvent.click(canvas.getByRole("button", { name: "Largeur, Récipient B : augmenter" }));
    await runToEnd(mounted, "Démarrer l'expérience", "Remettre à zéro");
    expect(canvas.getByTestId("status-1")).toHaveTextContent("Sec après 26,7 h");
    expect(canvas.getByRole("status")).toHaveTextContent("L'expérience est terminée à 40,0 h.");
    // the response does not depend on the language
    expect(fields(mounted)).toMatchObject({ score: 1, varied: "area" });
  },
};

export const Dutch: Story = {
  args: { properties: { ...FAST, language: "nl", question: "Verdampt water sneller als het oppervlak groter is?", width: "5" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Verdampingsproef" })).toBeInTheDocument();
    expect(canvas.getByRole("img", { name: "Bakje A: een bak van 5 cm breed bij 20 °C, met 200,0 mL water." })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Breedte, Bakje B hoger" }));
    await runToEnd(mounted, "Start de proef", "Opnieuw");
    expect(canvas.getByTestId("time")).toHaveTextContent("48,0 uur van 48 uur");
    expect(canvas.getByTestId("status-0")).toHaveTextContent("Water: 80,0 mL (40 %)");
    expect(canvas.getByTestId("status-1")).toHaveTextContent("Droog na 40,0 uur");
  },
};

export const RestoresState: Story = {
  args: { properties: { runSeconds: "8" } },
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    let state = "";
    let time = "";

    await step("halfway through a run, the candidate leaves the item", async () => {
      await userEvent.click(first.canvas.getByRole("button", { name: "Width, Container B higher" }));
      await userEvent.click(first.canvas.getByRole("button", { name: "Start the experiment" }));
      await waitFor(() => expect(Number(first.canvas.getByTestId("time").textContent!.split(" ")[0])).toBeGreaterThan(2));
      await userEvent.click(first.canvas.getByRole("button", { name: "Pause" }));
      time = first.canvas.getByTestId("time").textContent!;
      state = first.pci.getState();
      expect(JSON.parse(state).state).toMatchObject({ phase: "paused", touched: true });
    });

    await step("back: the same containers, the clock where it was, paused", async () => {
      const second = await remountPci(canvasElement, pci, { properties: { runSeconds: "8" }, state });
      expect(second.canvas.getByTestId("time").textContent).toBe(time);
      expect(second.canvas.getByRole("slider", { name: "Width, Container B" })).toHaveValue("15");
      expect(second.canvas.getByRole("button", { name: "Continue" })).toBeInTheDocument();
      expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
      expect(second.changes).toHaveLength(0);
    });
  },
};

export const BoundResponse: Story = {
  args: {
    boundTo: {
      RESPONSE: {
        record: [
          { name: "containers", base: { string: JSON.stringify([{ temperature: 20, width: 10, wind: false, salt: 35, volume: 200 }, { temperature: 20, width: 25, wind: false, salt: 35, volume: 200 }]) } },
          { name: "runs", base: { string: JSON.stringify([{ containers: [{ temperature: 20, width: 10, wind: false, salt: 35, volume: 200 }, { temperature: 20, width: 25, wind: false, salt: 35, volume: 200 }], hours: 40, completed: true, results: [] }]) } },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await waitFor(() => expect(canvas.getByRole("slider", { name: "Width, Container B" })).toHaveValue("25"));
    expect(fields(mounted)).toMatchObject({ score: 1, runCount: 1, varied: "area" });
    pci.resetResponse();
    await afterPaint(); // the reset shows after Preact's next render
    expect(canvas.getByRole("slider", { name: "Width, Container B" })).toHaveValue("10");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const Review: Story = {
  args: {
    status: "review",
    state: JSON.stringify({
      state: {
        containers: [{ temperature: 20, width: 10, wind: false, salt: 35, volume: 200 }, { temperature: 20, width: 20, wind: false, salt: 35, volume: 200 }],
        phase: "done", elapsed: 40, speed: 1, touched: true,
        runs: [{ containers: [{ temperature: 20, width: 10, wind: false, salt: 35, volume: 200 }, { temperature: 20, width: 20, wind: false, salt: 35, volume: 200 }], hours: 40, completed: true, results: [] }],
      },
      log: [],
    }),
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByTestId("time")).toHaveTextContent("40.0 h of 48 h");
    expect(canvas.getByTestId("status-1")).toHaveTextContent("Dry after 20.0 h");
    expect(canvas.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(canvas.getByRole("slider", { name: "Width, Container B" })).toBeDisabled();
    expect(canvas.getByRole("radio", { name: "×2" })).toBeDisabled();
    expect(fields(mounted)).toMatchObject({ score: 1, fairTest: 1, ran: 1 });
    expect(mounted.changes).toHaveLength(0);
  },
};

/** Two interactions in one item: each has its own store, clock and settings. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const [name, args] of [["first", { properties: FAST }], ["second", { properties: { ...FAST, language: "nl" } }]] as const) {
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
    await userEvent.click(first.canvas.getByRole("button", { name: "Width, Container B higher" }));
    await runToEnd(first);
    expect(fields(first)).toMatchObject({ ran: 1 });
    expect(second.pci.getResponse()).toBeUndefined();
    expect(second.canvas.getByRole("button", { name: "Start de proef" })).toBeInTheDocument();
  },
};
