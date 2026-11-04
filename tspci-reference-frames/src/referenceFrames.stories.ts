// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Trainpci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Relatempci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { afterPaint, lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Reference frames",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "Watch the train from the cow's point of view and from the passenger's. What does the trajectory of the red ladybird look like?";
const Q_GROUND = "What does the trajectory of the red ladybird look like for the cow?";
const Q_TRAIN = "What does the trajectory of the red ladybird look like for the passenger in the train?";

/** The fields of the record response, by name. */
const fields = (mounted: MountedPci) => {
  const response = mounted.pci.getResponse();
  if (!response) return undefined;
  return Object.fromEntries(response.record.map((f: any) => [f.name, f.base.integer ?? f.base.string]));
};
const click = async (element: HTMLElement) => {
  await userEvent.click(element);
  await afterPaint();
};
/** The radio of an answer within the fieldset of a question. */
const option = (canvas: MountedPci["canvas"], question: string, answer: string) =>
  within(canvas.getByRole("group", { name: question })).getByRole("radio", { name: answer });

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the train at the start, seen by the cow, paused; the red ladybird traced", async () => {
      expect(canvas.getByText(PROMPT)).toBeInTheDocument();
      expect(canvas.getByRole("region", { name: "Reference frames simulation" })).toBeInTheDocument();
      expect(canvas.getByRole("radio", { name: "The Earth's frame: the cow in the field" })).toBeChecked();
      expect(canvas.getByRole("radio", { name: "The train's frame: the passenger" })).not.toBeChecked();
      expect(canvas.getByRole("checkbox", { name: "Red ladybird (on the rim of the wheel)" })).toBeChecked();
      expect(canvas.getByRole("checkbox", { name: "Blue ladybird (on the axle)" })).not.toBeChecked();
      expect(canvas.getByRole("button", { name: "Play" })).toBeEnabled();
      expect(canvas.getByRole("button", { name: "Step back" })).toBeDisabled();
      expect(canvas.getByRole("slider", { name: "Time" })).toHaveAttribute("aria-valuetext", "0.00 turns of the wheel");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("a step forward: the cow saw the ladybird move; the picture does not give the shape away", async () => {
      await click(canvas.getByRole("button", { name: "Step forward" }));
      expect(canvas.getByRole("slider", { name: "Time" })).toHaveAttribute("aria-valuetext", "0.06 turns of the wheel");
      expect(canvas.getByRole("img")).toHaveAccessibleName(/Seen by the cow, after 0\.06 turns of the wheel\. The trajectory of the red ladybird is drawn\.$/);
      expect(fields(mounted)).toEqual({ score: 0, maxscore: 2, correct: 0, answers: "", viewed: "ground:rim" });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("eight steps: half a turn, the ladybird is at the top of its arch", async () => {
      for (let i = 0; i < 7; i++) await click(canvas.getByRole("button", { name: "Step forward" }));
      expect(canvas.getByTestId("turns")).toHaveTextContent("0.50 turns of the wheel");
      const trace = canvas.getByTestId("traces").querySelector("[data-trace='rim'] path")!.getAttribute("d")!;
      expect(trace.endsWith("-2.00")).toBe(true); // two wheel radii above the rail
    });

    await step("the train's frame, with the blue ladybird too: the trace is redrawn as the passenger sees it", async () => {
      await click(canvas.getByRole("radio", { name: "The train's frame: the passenger" }));
      await click(canvas.getByRole("checkbox", { name: "Blue ladybird (on the axle)" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Point of view: The train's frame: the passenger.");
      expect(canvas.getByTestId("picture").querySelector("svg")).toHaveAttribute("data-frame", "vehicle");
      // no question about the blue ladybird: the description names its shape
      expect(canvas.getByRole("img")).toHaveAccessibleName(/The trajectory of the blue ladybird: a point \(at rest\)\.$/);
      expect(fields(mounted)!.viewed).toBe("ground:rim;vehicle:rim,hub");
    });

    await step("the answers: arches for the cow, a circle for the passenger", async () => {
      await click(option(canvas, Q_GROUND, "Arches (cycloid)"));
      expect(fields(mounted)).toMatchObject({ score: 1, maxscore: 2, correct: 0, answers: "rim@ground=cycloid" });
      await click(option(canvas, Q_TRAIN, "A straight line"));
      expect(fields(mounted)).toMatchObject({ score: 1, correct: 0 });
      await click(option(canvas, Q_TRAIN, "A circle"));
      expect(fields(mounted)).toEqual({
        score: 2, maxscore: 2, correct: 1, answers: "rim@ground=cycloid;rim@vehicle=circle", viewed: "ground:rim;vehicle:rim,hub",
      });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("back to the start: the time, not the response", async () => {
      await click(canvas.getByRole("button", { name: "Back to the start" }));
      expect(canvas.getByTestId("turns")).toHaveTextContent("0.00 turns of the wheel");
      expect(fields(mounted)!.score).toBe(2);
    });
  },
};

export const PlayAndPause: Story = {
  args: { properties: { rate: "2", trajectoryQuestions: "" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("play runs the time; pause stops it where it is", async () => {
      expect(canvas.getByRole("combobox", { name: "Playback speed" })).toHaveValue("2");
      await click(canvas.getByRole("button", { name: "Play" }));
      const svg = canvas.getByTestId("picture").querySelector("svg")!;
      await waitFor(() => expect(Number(svg.getAttribute("data-time"))).toBeGreaterThan(0.5));
      await click(canvas.getByRole("button", { name: "Pause" }));
      const stopped = svg.getAttribute("data-time");
      await new Promise((r) => setTimeout(r, 150));
      expect(svg.getAttribute("data-time")).toBe(stopped);
      expect(canvas.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    await step("without questions the record has what was viewed (and no score)", async () => {
      expect(fields(mounted)).toEqual({ answers: "", viewed: "ground:rim" });
      expect(pci.getResponse()!.record.map((f: any) => f.name)).toEqual(["answers", "viewed"]);
    });

    await step("the time slider: straight to the end of the run", async () => {
      const slider = canvas.getByRole("slider", { name: "Time" }) as HTMLInputElement;
      slider.value = slider.max;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
      await afterPaint();
      expect(canvas.getByTestId("turns")).toHaveTextContent("2.00 turns of the wheel");
      expect(canvas.getByRole("button", { name: "Step forward" })).toBeDisabled();
    });
  },
};

export const Autoplay: Story = {
  args: { properties: { autoplay: "true", trajectoryQuestions: "" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    const svg = canvas.getByTestId("picture").querySelector("svg")!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // reduced motion: no autoplay, a note about the step buttons
      expect(canvas.getByTestId("reduced-motion")).toBeInTheDocument();
      expect(svg.getAttribute("data-time")).toBe("0.000");
    } else {
      await waitFor(() => expect(Number(svg.getAttribute("data-time"))).toBeGreaterThan(0.1));
      expect(canvas.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    }
  },
};

export const MotorbikeThreeObservers: Story = {
  args: {
    properties: {
      scene: "motorbike",
      prompt: "Zoé rides past Marc. A cyclist rides the same way at half her speed.",
      frames: "ground;vehicle;second",
      points: "rim;hub;passenger;bystander;second",
      traced: "rim;bystander",
      trajectoryQuestions: "rim@second",
      shapeOptions: "line;circle;cycloid",
      motionQuestions: "bystander@vehicle;passenger@vehicle;second@ground",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("three points of view, five points to trace", async () => {
      expect(canvas.getByRole("radio", { name: "Marc's point of view (on his rock)" })).toBeChecked();
      expect(canvas.getByRole("radio", { name: "Zoé's point of view (on the motorbike)" })).toBeInTheDocument();
      expect(canvas.getByRole("radio", { name: "The cyclist's point of view" })).toBeInTheDocument();
      expect(canvas.getAllByRole("checkbox")).toHaveLength(5);
      expect(canvas.getByRole("checkbox", { name: "Marc" })).toBeChecked();
    });

    await step("the shape the key needs is among the options (loops), next to the author's", async () => {
      const group = within(canvas.getByRole("group", { name: "What does the trajectory of the valve of the rear wheel look like for the cyclist?" }));
      expect(group.getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["line", "circle", "cycloid", "loops"]);
    });

    await step("seen by the cyclist, Marc moves back in a straight line", async () => {
      await click(canvas.getByRole("radio", { name: "The cyclist's point of view" }));
      await click(canvas.getByRole("button", { name: "Step forward" }));
      expect(canvas.getByRole("img")).toHaveAccessibleName(/Seen by the cyclist, after 0\.06 turns of the wheel\..*The trajectory of Marc: a straight line\./);
    });

    await step("does it move or is it at rest?", async () => {
      await click(option(canvas, "For Zoé, Marc…", "moves"));
      await click(option(canvas, "For Zoé, Zoé…", "moves"));
      await click(option(canvas, "For Marc, the cyclist…", "moves"));
      await click(option(canvas, "What does the trajectory of the valve of the rear wheel look like for the cyclist?", "Loops"));
      expect(fields(mounted)).toEqual({
        score: 3, maxscore: 4, correct: 0,
        answers: "rim@second=loops;bystander@vehicle=moves;passenger@vehicle=moves;second@ground=moves",
        viewed: "second:rim,bystander",
      });
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });
  },
};

export const French: Story = {
  args: { properties: { language: "fr", prompt: "Observe le train depuis la vache, puis depuis le passager." } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Simulation de référentiels" })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "Le référentiel terrestre : la vache dans le pré" })).toBeChecked();
    expect(canvas.getByRole("checkbox", { name: "Coccinelle rouge (sur le bord de la roue)" })).toBeChecked();
    expect(canvas.getByRole("option", { name: "0,25×" })).toBeInTheDocument();
    await click(canvas.getByRole("button", { name: "Pas en avant" }));
    expect(canvas.getByTestId("turns")).toHaveTextContent("0,06 tour de roue");
    await click(option(canvas, "Quelle est l'allure de la trajectoire de la coccinelle rouge pour la vache ?", "Des arches (cycloïde)"));
    expect(fields(mounted)).toMatchObject({ score: 1, answers: "rim@ground=cycloid", viewed: "ground:rim" });
  },
};

export const Dutch: Story = {
  args: {
    properties: {
      language: "nl", scene: "motorbike", prompt: "Zoé rijdt langs Marc.", trajectoryQuestions: "", motionQuestions: "passenger@ground",
      traced: "passenger",
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("radio", { name: "Wat Marc ziet (op zijn rots)" })).toBeChecked();
    await click(canvas.getByRole("radio", { name: "Wat Zoé ziet (op de motor)" }));
    for (let i = 0; i < 4; i++) await click(canvas.getByRole("button", { name: "Stap vooruit" }));
    expect(canvas.getByTestId("turns")).toHaveTextContent("0,25 omwentelingen van het wiel");
    expect(canvas.getByRole("option", { name: "0,5×" })).toBeInTheDocument();
    await click(option(canvas, "Voor Marc is Zoé…", "in beweging"));
    expect(fields(mounted)).toEqual({ score: 1, maxscore: 1, correct: 1, answers: "passenger@ground=moves", viewed: "vehicle:passenger" });
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);
    await click(first.canvas.getByRole("radio", { name: "The train's frame: the passenger" }));
    for (let i = 0; i < 3; i++) await click(first.canvas.getByRole("button", { name: "Step forward" }));
    await click(option(first.canvas, Q_TRAIN, "A circle"));
    await userEvent.selectOptions(first.canvas.getByRole("combobox", { name: "Playback speed" }), "0.5×");
    const response = first.pci.getResponse();
    const state = first.pci.getState();
    expect(JSON.parse(state).log.map((a: any) => a.type)).toEqual(["FRAME", "TIME", "SEEN", "TIME", "TIME", "ANSWER", "RATE"]);

    await step("back in the item: the point of view, the time, the speed and the answer", async () => {
      const again = await remountPci(canvasElement, pci, { state });
      const { canvas } = again;
      expect(canvas.getByRole("radio", { name: "The train's frame: the passenger" })).toBeChecked();
      expect(canvas.getByTestId("turns")).toHaveTextContent("0.19 turns of the wheel");
      expect(canvas.getByRole("combobox", { name: "Playback speed" })).toHaveValue("0.5");
      expect(option(canvas, Q_TRAIN, "A circle")).toBeChecked();
      expect(again.pci.getResponse()).toEqual(response);
      expect(again.changes).toHaveLength(0);
    });

    await step("a response alone (boundTo) brings back the answers and what was viewed", async () => {
      const again = await remountPci(canvasElement, pci, { boundTo: { RESPONSE: response } });
      expect(option(again.canvas, Q_TRAIN, "A circle")).toBeChecked();
      expect(again.pci.getResponse()).toEqual(response);
    });
  },
};

export const Review: Story = {
  args: {
    status: "review",
    boundTo: { RESPONSE: { record: [{ name: "answers", base: { string: "rim@ground=line" } }, { name: "viewed", base: { string: "ground:rim" } }] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Step forward" })).toBeDisabled();
    expect(canvas.getByRole("radio", { name: "The train's frame: the passenger" })).toBeDisabled();
    expect(option(canvas, Q_GROUND, "A straight line")).toBeChecked();
    expect(option(canvas, Q_GROUND, "A straight line")).toBeDisabled();
    expect(pci.getResponse()!.record.find((f: any) => f.name === "score").base.integer).toBe(0);
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { motionQuestions: "passenger@vehicle" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(option(canvas, Q_GROUND, "Arches (cycloid)")).toBeChecked();
    expect(option(canvas, Q_TRAIN, "A circle")).toBeChecked();
    expect(option(canvas, "For the passenger in the train, the passenger…", "is at rest")).toBeChecked();
    expect(option(canvas, Q_TRAIN, "A circle")).toBeDisabled();
  },
};
