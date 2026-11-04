// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/ForceGravitepci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Delorpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountPci, openPci, remountPci, retype, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Mass and weight",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

/** A field of the record the PCI reports. */
const field = (mounted: MountedPci, name: string) => {
  const response = mounted.pci.getResponse();
  return response?.record?.find((f: { name: string }) => f.name === name)?.base;
};
const readings = (mounted: MountedPci) => JSON.parse(field(mounted, "readings")?.string ?? "[]");
const reading = (mounted: MountedPci, instrument: string) => mounted.canvas.getByTestId(`reading-${instrument}`).textContent!.replace(/\s+/g, " ").trim();

/** Moves the water slider to a value and lets go. */
const pour = async (slider: HTMLElement, value: number) => {
  (slider as HTMLInputElement).value = String(value);
  fireEvent.input(slider);
  fireEvent.change(slider);
  await afterPaint();
};

/** Drags an object of the bench to a point of the bench (in the 900 × 440 of the drawing), as a mouse does. */
const drag = async (mounted: MountedPci, object: string, x: number, y: number) => {
  const svg = mounted.root.querySelector<SVGSVGElement>('[data-testid="bench"]')!;
  const g = mounted.root.querySelector<SVGGElement>(`[data-testid="object-${object}"]`)!;
  const box = svg.getBoundingClientRect();
  const from = g.getBoundingClientRect();
  const to = { clientX: box.left + (x * box.width) / 900, clientY: box.top + (y * box.height) / 440 };
  const start = { clientX: from.left + from.width / 2, clientY: from.top + from.height / 2 };
  fireEvent.pointerDown(g, { ...start, pointerId: 7, button: 0, isPrimary: true });
  await afterPaint();
  fireEvent.pointerMove(g, { ...to, pointerId: 7, isPrimary: true });
  await afterPaint();
  fireEvent.pointerUp(g, { ...to, pointerId: 7, isPrimary: true });
  await afterPaint();
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the bench on Earth: three places, three instruments, two objects on the table", async () => {
      expect(canvas.getByText("Use the instruments to find out the mass, the weight and the volume of the objects.")).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Earth" })).toHaveAttribute("aria-pressed", "true");
      expect(canvas.getByRole("button", { name: "Moon" })).toHaveAttribute("aria-pressed", "false");
      expect(canvas.getByRole("img", { name: /^Lab bench on Earth\. Scale: off\. Dynamometer: 0 N\. Graduated cylinder: 0 mL\. On the table: the statuette, the meteorite\./ })).toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "Put the meteorite in the cylinder" })).toBeDisabled();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the statuette on the scale with the keyboard: the scale is off", async () => {
      canvas.getByRole("button", { name: "Put the statuette on the scale" }).focus();
      await userEvent.keyboard("{Enter}");
      expect(canvas.getByTestId("row-statuette")).toHaveTextContent("Statuette on the scale");
      expect(reading(mounted, "scale")).toBe("Reading: off");
      expect(canvas.getByRole("status")).toHaveTextContent("The statuette on the scale. Scale: off.");
    });

    await step("switched on: 190 g, logged", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Scale on or off" }));
      expect(canvas.getByRole("button", { name: "Scale on or off" })).toHaveAttribute("aria-pressed", "true");
      expect(reading(mounted, "scale")).toBe("Reading: 190 g");
      expect(canvas.getByTestId("scale-display")).toHaveTextContent("190 g");
      expect(readings(mounted)).toEqual([{ place: "earth", instrument: "scale", object: "statuette", value: 190, unit: "g" }]);
      expect(field(mounted, "used")).toEqual({ string: "earth:scale" });
      expect(JSON.parse(field(mounted, "bench").string)).toEqual({ place: "earth", placements: { statuette: "scale" }, water: 0, scaleOn: true, tare: 0 });
      expect(field(mounted, "score")).toBeUndefined(); // no answer fields: no score
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });
  },
};

/** ForceGravite: the same meteorite on the balance and the dynamometer, on Earth, the Moon and Mars. */
export const MassAndWeight: Story = {
  args: { properties: { objects: "meteorite", showCylinder: "false", scaleOnOff: "false" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("on Earth: 40 kg on the scale, 392 N on the dynamometer", async () => {
      expect(canvas.queryByRole("button", { name: "Scale on or off" })).toBeNull();
      await userEvent.click(canvas.getByRole("button", { name: "Put the meteorite on the scale" }));
      expect(reading(mounted, "scale")).toBe("Reading: 40.000 kg");
      await userEvent.click(canvas.getByRole("button", { name: "Hang the meteorite on the dynamometer" }));
      expect(reading(mounted, "dynamometer")).toBe("Reading: 392 N");
      expect(reading(mounted, "scale")).toBe("Reading: 0 g");
    });

    await step("on the Moon 64 N, on Mars 144 N", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Moon" }));
      expect(canvas.getByTestId("welcome")).toHaveTextContent("Welcome to the Moon");
      expect(canvas.getByTestId("bench")).toHaveAttribute("data-place", "moon");
      expect(reading(mounted, "dynamometer")).toBe("Reading: 64 N");
      expect(canvas.getByRole("status")).toHaveTextContent("Welcome to the Moon. Dynamometer: 64 N.");
      await userEvent.click(canvas.getByRole("button", { name: "Mars" }));
      expect(reading(mounted, "dynamometer")).toBe("Reading: 144 N");
    });

    await step("on Mars the scale still shows 40 kg", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Put the meteorite on the scale" }));
      expect(reading(mounted, "scale")).toBe("Reading: 40.000 kg");
      expect(field(mounted, "used")).toEqual({ string: "earth:scale earth:dynamometer moon:dynamometer mars:dynamometer mars:scale" });
      const dyn = readings(mounted).filter((r: { instrument: string }) => r.instrument === "dynamometer");
      expect(dyn.map((r: { place: string; value: number }) => [r.place, r.value])).toEqual([["earth", 392], ["moon", 64], ["mars", 144]]);
      expect(pci.current().dynamometer.value).toBe(0);
    });
  },
};

/** Delor: the statuette in the graduated cylinder, the water from the slider. */
export const Cylinder: Story = {
  args: { properties: { showDynamometer: "false" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    const slider = canvas.getByRole("slider", { name: "Water in the cylinder" });

    await step("water only: the level is the water", async () => {
      await pour(slider, 30);
      expect(slider).toHaveAttribute("aria-valuetext", "30 mL poured");
      expect(reading(mounted, "cylinder")).toBe("Reading: 30 mL");
    });

    await step("too little water: the statuette is partly under water", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Put the statuette in the cylinder" }));
      expect(reading(mounted, "cylinder")).toBe("Reading: 36 mL (the object is partly under water)");
    });

    await step("enough water: the level rises by the volume of the statuette", async () => {
      await pour(slider, 50);
      expect(reading(mounted, "cylinder")).toBe("Reading: 60 mL");
      expect(canvas.getByTestId("water")).toHaveAttribute("data-level", "60");
    });

    await step("above the top graduation, then over the brim", async () => {
      await pour(slider, 85);
      expect(reading(mounted, "cylinder")).toBe("Reading: reading impossible: above the scale");
      await pour(slider, 120);
      expect(reading(mounted, "cylinder")).toBe("Reading: reading impossible: the cylinder overflows");
      expect(canvas.getByTestId("overflow")).toBeInTheDocument();
    });

    await step("out again: the level drops, the log has every reading", async () => {
      await pour(slider, 70);
      await userEvent.click(canvas.getByRole("button", { name: "Put the statuette back on the table" }));
      expect(reading(mounted, "cylinder")).toBe("Reading: 70 mL");
      expect(readings(mounted).map((r: { object: string | null; value: number | null; note?: string }) => [r.object, r.value, r.note ?? ""])).toEqual([
        [null, 30, ""], ["statuette", 36, "partly"], ["statuette", 60, ""], ["statuette", null, "aboveScale"],
        ["statuette", null, "overflow"], ["statuette", 80, ""], [null, 70, ""],
      ]);
    });
  },
};

export const Tare: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("button", { name: "Tare: set the scale to zero" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Scale on or off" }));
    expect(reading(mounted, "scale")).toBe("Reading: 0 g");
    await userEvent.click(canvas.getByRole("button", { name: "Put the statuette on the scale" }));
    await userEvent.click(canvas.getByRole("button", { name: "Tare: set the scale to zero" }));
    expect(reading(mounted, "scale")).toBe("Reading: 0 g");
    await userEvent.click(canvas.getByRole("button", { name: "Put the statuette back on the table" }));
    expect(reading(mounted, "scale")).toBe("Reading: −190 g");
    // off and on again: the tare is gone
    await userEvent.click(canvas.getByRole("button", { name: "Scale on or off" }));
    await userEvent.click(canvas.getByRole("button", { name: "Scale on or off" }));
    expect(reading(mounted, "scale")).toBe("Reading: 0 g");
  },
};

export const DragAndDrop: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("the statuette dragged onto the dynamometer", async () => {
      await drag(mounted, "statuette", 555, 200);
      expect(mounted.root.querySelector('[data-testid="object-statuette"]')).toHaveAttribute("data-at", "dynamometer");
      expect(reading(mounted, "dynamometer")).toBe("Reading: 1.86 N");
    });

    await step("the meteorite does not go in the cylinder", async () => {
      await drag(mounted, "meteorite", 785, 300);
      expect(mounted.root.querySelector('[data-testid="object-meteorite"]')).toHaveAttribute("data-at", "table");
      expect(canvas.getByRole("status")).toHaveTextContent("The meteorite does not fit in the cylinder.");
    });

    await step("the meteorite dragged onto the dynamometer pushes the statuette back to the table", async () => {
      await drag(mounted, "meteorite", 555, 200);
      expect(mounted.root.querySelector('[data-testid="object-meteorite"]')).toHaveAttribute("data-at", "dynamometer");
      expect(mounted.root.querySelector('[data-testid="object-statuette"]')).toHaveAttribute("data-at", "table");
      expect(Number(mounted.root.querySelector('[data-testid="dynamometer-marker"]')!.getAttribute("data-frac"))).toBeCloseTo(0.784, 3);
    });
  },
};

const ANSWERS = { objects: "statuette", answers: "mass, weight, volume, density", answerPlace: "moon", tolerance: "5" };

export const AnswersAndScore: Story = {
  args: { properties: ANSWERS },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("four answer fields with their units", async () => {
      expect(canvas.getByRole("group", { name: "Your answers" })).toBeInTheDocument();
      expect(canvas.getByRole("textbox", { name: "Weight of the statuette on the Moon" })).toBeInTheDocument();
      expect(canvas.getByText("g/mL")).toBeInTheDocument();
    });

    await step("the typed answers are scored within 5%", async () => {
      await retype(canvas.getByRole("textbox", { name: "Mass of the statuette" }), "190");
      await retype(canvas.getByRole("textbox", { name: "Weight of the statuette on the Moon" }), "0.3");
      await retype(canvas.getByRole("textbox", { name: "Volume of the statuette" }), "12");
      await retype(canvas.getByRole("textbox", { name: "Density of the statuette" }), "19,0");
      expect(field(mounted, "mass")).toEqual({ float: 190 });
      expect(field(mounted, "weight")).toEqual({ float: 0.3 });
      expect(field(mounted, "density")).toEqual({ float: 19 });
      expect(field(mounted, "score")).toEqual({ integer: 3 });
      expect(field(mounted, "maxscore")).toEqual({ integer: 4 });
      expect(field(mounted, "correct")).toEqual({ integer: 0 });
    });

    await step("all four right: correct", async () => {
      await retype(canvas.getByRole("textbox", { name: "Volume of the statuette" }), "10");
      expect(field(mounted, "correct")).toEqual({ integer: 1 });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("not a number: a hint, and no value", async () => {
      await retype(canvas.getByRole("textbox", { name: "Mass of the statuette" }), "abc");
      expect(canvas.getByText("Type a number.")).toBeInTheDocument();
      expect(field(mounted, "mass")).toBeUndefined();
      expect(field(mounted, "score")).toEqual({ integer: 3 });
    });
  },
};

export const Settings: Story = {
  args: {
    properties: {
      places: "moon",
      showScale: "false",
      showCylinder: "false",
      showG: "true",
      dynamometerMax: "2",
      dynamometerStep: "0.1",
      objects: "Apple | Appel | Pomme; 150 g; 160 mL\nBrick | Baksteen | Brique; 2 kg",
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    // one place: no tabs; g shown; only the dynamometer
    expect(canvas.queryByRole("group", { name: "Where is the lab?" })).toBeNull();
    expect(canvas.getByTestId("welcome")).toHaveTextContent("Welcome to the Moon (g = 1.6 N/kg)");
    expect(canvas.queryByRole("region", { name: "Scale" })).toBeNull();
    expect(canvas.getByRole("region", { name: "Dynamometer" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Hang the Apple on the dynamometer" }));
    expect(reading(mounted, "dynamometer")).toBe("Reading: 0.24 N");
    await userEvent.click(canvas.getByRole("button", { name: "Hang the Brick on the dynamometer" }));
    expect(reading(mounted, "dynamometer")).toBe("Reading: beyond the scale of the dynamometer");
    expect(canvas.getByTestId("row-object1")).toHaveTextContent("Apple on the table");
  },
};

export const French: Story = {
  args: { properties: { language: "fr", answers: "density", densityUnit: "g/cm3" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByText("Utilise les instruments pour trouver la masse, le poids et le volume des objets.")).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Lune" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Accrocher la statuette au dynamomètre" }));
    expect(reading(mounted, "dynamometer")).toBe("Lecture : 1,86 N");
    expect(canvas.getByRole("status")).toHaveTextContent("La statuette au dynamomètre. Dynamomètre : 1,86 N.");
    expect(canvas.getByRole("button", { name: "Plonger la météorite dans l'éprouvette" })).toBeDisabled();
    expect(canvas.getByRole("textbox", { name: "Masse volumique de la statuette" })).toBeInTheDocument();
    expect(canvas.getByText("g/cm³")).toBeInTheDocument();
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", scaleResolution: "0.1", answers: "mass", massUnit: "kg", objects: "meteorite" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("button", { name: "Maan" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Weegschaal aan of uit" }));
    await userEvent.click(canvas.getByRole("button", { name: "Zet de meteoriet op de weegschaal" }));
    expect(reading(mounted, "scale")).toBe("Aflezing: 40,0000 kg");
    await userEvent.click(canvas.getByRole("button", { name: "Maan" }));
    await userEvent.click(canvas.getByRole("button", { name: "Hang de meteoriet aan de krachtmeter" }));
    expect(reading(mounted, "dynamometer")).toBe("Aflezing: 64 N");
    await retype(canvas.getByRole("textbox", { name: "Massa van de meteoriet" }), "40,0");
    expect(field(mounted, "mass")).toEqual({ float: 40 });
    expect(field(mounted, "correct")).toEqual({ integer: 1 });
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "Moon" }));
    await userEvent.click(first.canvas.getByRole("button", { name: "Hang the meteorite on the dynamometer" }));
    await pour(first.canvas.getByRole("slider", { name: "Water in the cylinder" }), 50);
    await userEvent.click(first.canvas.getByRole("button", { name: "Put the statuette in the cylinder" }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state.placements).toEqual({ meteorite: "dynamometer", statuette: "cylinder" });

    const second = await remountPci(canvasElement, pci, { state });
    expect(second.canvas.getByRole("button", { name: "Moon" })).toHaveAttribute("aria-pressed", "true");
    expect(reading(second, "dynamometer")).toBe("Reading: 64 N");
    expect(reading(second, "cylinder")).toBe("Reading: 60 mL");
    expect(second.canvas.getByRole("slider", { name: "Water in the cylinder" })).toHaveValue("50");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: {
    properties: ANSWERS,
    boundTo: {
      RESPONSE: {
        record: [
          { name: "volume", base: { float: 10 } },
          { name: "readings", base: { string: JSON.stringify([{ place: "earth", instrument: "cylinder", object: null, value: 40, unit: "mL" }]) } },
          { name: "bench", base: { string: JSON.stringify({ place: "mars", placements: { statuette: "cylinder" }, water: 50, scaleOn: false, tare: 0 }) } },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await waitFor(() => expect(reading(mounted, "cylinder")).toBe("Reading: 60 mL"));
    expect(canvas.getByRole("button", { name: "Mars" })).toHaveAttribute("aria-pressed", "true");
    expect(canvas.getByRole("textbox", { name: "Volume of the statuette" })).toHaveValue("10");
    expect(field(mounted, "score")).toEqual({ integer: 1 });
    pci.resetResponse();
    await afterPaint(); // the reset shows after Preact's next render
    expect(reading(mounted, "cylinder")).toBe("Reading: 0 mL");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const Review: Story = {
  args: {
    status: "review",
    state: JSON.stringify({
      state: { place: "earth", placements: { statuette: "scale" }, water: 20, scaleOn: true, tare: 0, answers: {}, readings: [] },
      log: [],
    }),
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(reading(mounted, "scale")).toBe("Reading: 190 g");
    for (const button of canvas.getAllByRole("button")) expect(button).toBeDisabled();
    expect(canvas.getByRole("slider", { name: "Water in the cylinder" })).toBeDisabled();
    await drag(mounted, "statuette", 785, 300);
    expect(mounted.root.querySelector('[data-testid="object-statuette"]')).toHaveAttribute("data-at", "scale");
    expect(mounted.changes).toHaveLength(0);
  },
};
