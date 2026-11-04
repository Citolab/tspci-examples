// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent } from "storybook/test";
import { afterPaint, lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Gravitation",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT =
  "Change the distance between the planet and the star, the mass of the planet and its radius. Record measurements to find out which quantities change the gravitational force.";

/** The force as the candidate reads it, without spaces: "6.67×1027N" (the exponent is a superscript). */
const force = (canvas: MountedPci["canvas"]) => canvas.getByTestId("force-text").textContent!.replace(/\s+/g, "");
/** Drags a slider to a value and lets go: the picture follows while dragging (input), the value goes in on release (change). */
const slide = async (slider: HTMLElement, value: number) => {
  (slider as HTMLInputElement).value = String(value);
  fireEvent.input(slider);
  fireEvent.change(slider);
  await afterPaint();
};
/** The cells of a row of the table, as text: "1 | 100 | 10 | 10,000 | 6.67 × 1027 | ×". */
const cells = (row: HTMLElement) => Array.from(row.children).map((c) => c.textContent!.replace(/\s+/g, " ").trim()).join(" | ");
/** The fields of the record response, as { name: value }. */
const fields = (mounted: MountedPci) => {
  const response = mounted.pci.getResponse() as any;
  if (!response) return undefined;
  return Object.fromEntries(response.record.map((f: any) => [f.name, Object.values(f.base)[0]]));
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the planet at 100 million km, 10 × 10²³ kg: 6.67 × 10²⁷ N", async () => {
      expect(canvas.getByText(PROMPT)).toBeInTheDocument();
      expect(canvas.getByRole("region", { name: "Gravitation simulation" })).toBeInTheDocument();
      expect(canvas.getByRole("img", { name: "A star on the left and a planet 100 million km away, with a radius of 10,000 km." })).toBeInTheDocument();
      expect(force(canvas)).toBe("6.67×1027N");
      expect(canvas.getByText("6.67 times 10 to the power 27 newtons")).toBeInTheDocument();
      expect(canvas.getByRole("slider", { name: "Distance between planet and star" })).toHaveAttribute("aria-valuetext", "100 million kilometres");
      expect(canvas.getByRole("slider", { name: "Mass of the planet" })).toHaveValue("10");
      expect(canvas.getByRole("slider", { name: "Radius of the planet" })).toHaveValue("10000");
      expect(canvas.getByRole("group", { name: /Which quantities influence/ })).toBeInTheDocument();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("twice as far: a quarter of the force", async () => {
      await slide(canvas.getByRole("slider", { name: "Distance between planet and star" }), 200);
      expect(force(canvas)).toBe("1.67×1027N");
      expect(canvas.getByRole("status")).toHaveTextContent("Gravitational force: 1.67 times 10 to the power 27 newtons.");
      expect(fields(mounted)).toMatchObject({ distance: 200, mass: 10, radius: 10000, force: 1.67e27, changed: "distance", measurementCount: 0 });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("one step more mass with the + button: 11 × 10²³ kg", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Mass of the planet larger" }));
      expect(canvas.getByTestId("mass-value")).toHaveTextContent("11 × 10²³ kg");
      expect(force(canvas)).toBe("1.83×1027N");
      expect(fields(mounted)).toMatchObject({ changed: "distance;mass" });
    });

    await step("the radius moves the picture, not the force", async () => {
      const r = canvas.getByTestId("picture").getAttribute("data-planet-r");
      await slide(canvas.getByRole("slider", { name: "Radius of the planet" }), 20000);
      expect(canvas.getByTestId("picture").getAttribute("data-planet-r")).not.toBe(r);
      expect(force(canvas)).toBe("1.83×1027N");
    });
  },
};

export const RecordMeasurements: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("no measurements yet", async () => {
      expect(canvas.getByText(/No measurements yet/)).toBeInTheDocument();
      expect(canvas.queryByRole("table")).toBeNull();
    });

    await step("record, change only the radius, record again: the same force", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Record measurement" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Measurement 1 recorded.");
      await slide(canvas.getByRole("slider", { name: "Radius of the planet" }), 5000);
      await userEvent.click(canvas.getByRole("button", { name: "Record measurement" }));
      await slide(canvas.getByRole("slider", { name: "Mass of the planet" }), 20);
      await userEvent.click(canvas.getByRole("button", { name: "Record measurement" }));
      const rows = canvas.getAllByRole("row");
      expect(rows).toHaveLength(4); // a header and three measurements
      expect(cells(rows[1])).toBe("1 | 100 | 10 | 10,000 | 6.67 × 1027 | ×");
      expect(cells(rows[2])).toBe("2 | 100 | 10 | 5,000 | 6.67 × 1027 | ×");
      expect(cells(rows[3])).toBe("3 | 100 | 20 | 5,000 | 1.33 × 1028 | ×");
    });

    await step("the measurements in the response", async () => {
      const f = fields(mounted)!;
      expect(f.measurementCount).toBe(3);
      expect(JSON.parse(f.measurements as string)).toEqual([
        { distance: 100, mass: 10, radius: 10000, force: 6.67e27 },
        { distance: 100, mass: 10, radius: 5000, force: 6.67e27 },
        { distance: 100, mass: 20, radius: 5000, force: 1.33e28 },
      ]);
    });

    await step("remove a measurement", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove measurement 2" }));
      expect(canvas.getAllByRole("row")).toHaveLength(3);
      expect(fields(mounted)!.measurementCount).toBe(2);
      expect(canvas.getByRole("status")).toHaveTextContent("Measurement 2 removed.");
    });
  },
};

export const Question: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("ticking the distance and the mass: correct", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Distance between planet and star" }));
      expect(fields(mounted)).toMatchObject({ answer: "distance", correct: 0, score: 0, changed: "" });
      await userEvent.click(canvas.getByRole("checkbox", { name: "Mass of the planet" }));
      expect(fields(mounted)).toMatchObject({ answer: "distance;mass", correct: 1, score: 1 });
      expect(await lastChange(mounted, 2)).toEqual(pci.getResponse());
    });

    await step("the radius too: the distractor makes it wrong", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Radius of the planet" }));
      expect(fields(mounted)).toMatchObject({ answer: "distance;mass;radius", correct: 0, score: 0 });
    });
  },
};

export const Settings: Story = {
  args: {
    properties: {
      starMass: "1.989e30",
      showRadius: "false",
      distanceMin: "100",
      distanceMax: "300",
      distanceStep: "10",
      distance: "150",
      mass: "60",
      massMax: "100",
      digits: "2",
      record: "false",
      question: "influence",
      questionText: "Which of these change the force?",
      key: "mass",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("the Sun and an Earth-like planet: 3.5 × 10²² N, two digits", async () => {
      expect(force(canvas)).toBe("3.5×1022N");
      expect(canvas.queryByRole("slider", { name: "Radius of the planet" })).toBeNull();
      expect(canvas.queryByRole("button", { name: "Record measurement" })).toBeNull();
      expect(canvas.getByRole("group", { name: "Which of these change the force?" })).toBeInTheDocument();
      expect(canvas.queryByRole("checkbox", { name: "Radius of the planet" })).toBeNull();
    });

    await step("the distance slider of the settings", async () => {
      const distance = canvas.getByRole("slider", { name: "Distance between planet and star" });
      expect(distance).toHaveAttribute("min", "100");
      expect(distance).toHaveAttribute("max", "300");
      await userEvent.click(canvas.getByRole("button", { name: "Distance between planet and star larger" }));
      expect(distance).toHaveValue("160");
    });

    await step("the author's key: only the mass", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: "Mass of the planet" }));
      expect(fields(mounted)).toMatchObject({ distance: 160, radius: 10000, answer: "mass", correct: 1, score: 1 });
    });
  },
};

export const ToolWithoutQuestion: Story = {
  args: { properties: { question: "none" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.queryByRole("group")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Record measurement" }));
    const f = fields(mounted)!;
    expect(f.measurementCount).toBe(1);
    expect(f).not.toHaveProperty("score");
    expect(f).not.toHaveProperty("answer");
  },
};

export const French: Story = {
  args: { properties: { language: "fr" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("les textes en français et une virgule décimale", async () => {
      expect(canvas.getByRole("region", { name: "Simulation de la force de gravitation" })).toBeInTheDocument();
      expect(canvas.getByText("Valeur de la force de gravitation")).toBeInTheDocument();
      expect(force(canvas)).toBe("6,67×1027N");
      expect(canvas.getByText("6,67 fois 10 puissance 27 newtons")).toBeInTheDocument();
      expect(canvas.getByRole("slider", { name: "Distance planète / étoile" })).toHaveAttribute("aria-valuetext", "100 millions de kilomètres");
      expect(canvas.getByTestId("radius-value").textContent!.replace(/\s/g, " ")).toBe("10 000 km");
    });

    await step("enregistrer une mesure", async () => {
      await slide(canvas.getByRole("slider", { name: "Distance planète / étoile" }), 150);
      await userEvent.click(canvas.getByRole("button", { name: "Enregistrer la mesure" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Mesure 1 enregistrée.");
      expect(cells(canvas.getAllByRole("row")[1])).toBe("1 | 150 | 10 | 10 000 | 2,96 × 1027 | ×");
      expect(fields(mounted)).toMatchObject({ distance: 150, force: 2.96e27 });
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", mass: "30" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Simulatie van de gravitatiekracht" })).toBeInTheDocument();
    expect(force(canvas)).toBe("2,00×1028N");
    expect(canvas.getByTestId("radius-value")).toHaveTextContent("10.000 km");
    expect(canvas.getByTestId("distance-value")).toHaveTextContent("100 miljoen km");
    expect(canvas.getByRole("group", { name: /Welke grootheden hebben invloed/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Meting vastleggen" }));
    expect(canvas.getByRole("status")).toHaveTextContent("Meting 1 vastgelegd.");
    expect(canvas.getByRole("columnheader", { name: "Afstand (miljoen km)" })).toBeInTheDocument();
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await slide(first.canvas.getByRole("slider", { name: "Distance between planet and star" }), 300);
    await userEvent.click(first.canvas.getByRole("button", { name: "Record measurement" }));
    await userEvent.click(first.canvas.getByRole("checkbox", { name: "Mass of the planet" }));
    const response = first.pci.getResponse();
    const state = first.pci.getState();

    await step("from getState: the sliders, the table, the answer and the log", async () => {
      const second = await remountPci(canvasElement, pci, { state });
      expect(second.pci.getResponse()).toEqual(response);
      expect(second.canvas.getByRole("slider", { name: "Distance between planet and star" })).toHaveValue("300");
      expect(second.canvas.getAllByRole("row")).toHaveLength(2);
      expect(second.canvas.getByRole("checkbox", { name: "Mass of the planet" })).toBeChecked();
      expect(JSON.parse(second.pci.getState()).log.length).toBeGreaterThanOrEqual(3);
      expect(second.changes).toHaveLength(0);
    });

    await step("from the response alone (boundTo)", async () => {
      const third = await remountPci(canvasElement, pci, { boundTo: { RESPONSE: response! } });
      expect(third.pci.getResponse()).toEqual(response);
      expect(third.canvas.getByRole("slider", { name: "Mass of the planet" })).toHaveValue("10");
      expect(third.canvas.getByRole("checkbox", { name: "Mass of the planet" })).toBeChecked();
    });

    await step("a state that is not ours: the start", async () => {
      const fourth = await remountPci(canvasElement, pci, { state: "nonsense" });
      expect(fourth.pci.getResponse()).toBeUndefined();
      expect(fourth.canvas.getByRole("slider", { name: "Distance between planet and star" })).toHaveValue("100");
    });
  },
};

const ANSWERED = JSON.stringify({
  state: {
    values: { distance: 250, mass: null, radius: null },
    changed: ["distance"],
    records: [{ distance: 250, mass: 10, radius: 10000, force: 1.07e27 }],
    answer: ["distance", "radius"],
  },
  log: [],
});

export const Review: Story = {
  args: { status: "review", state: ANSWERED },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(force(canvas)).toBe("1.07×1027N");
    for (const slider of canvas.getAllByRole("slider")) expect(slider).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Record measurement" })).toBeDisabled();
    expect(canvas.queryByRole("button", { name: "Remove measurement 1" })).toBeNull();
    expect(canvas.getByRole("checkbox", { name: "Radius of the planet" })).toBeDisabled();
    expect(canvas.getByRole("checkbox", { name: "Radius of the planet" })).toBeChecked();
    const before = pci.getResponse();
    expect(fields(mounted)).toMatchObject({ distance: 250, answer: "distance;radius", score: 0 });
    await userEvent.click(canvas.getByRole("button", { name: "Distance between planet and star larger" })).catch(() => {});
    expect(pci.getResponse()).toEqual(before);
  },
};

export const Solution: Story = {
  args: { status: "solution", state: ANSWERED },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("checkbox", { name: "Distance between planet and star" })).toBeChecked();
    expect(canvas.getByRole("checkbox", { name: "Mass of the planet" })).toBeChecked();
    expect(canvas.getByRole("checkbox", { name: "Radius of the planet" })).not.toBeChecked();
    expect(canvas.getByRole("checkbox", { name: "Mass of the planet" })).toBeDisabled();
  },
};
