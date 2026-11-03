import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { afterPaint, lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Sound level",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "Choose the power of the speaker and move the listener. How loud is the sound where the listener stands?";
const ANSWER = { mode: "answer", answer: "distance", power: "50", targetLevel: "70" };

/** The level the readout shows, without spaces: "83.0dB". */
const level = (canvas: MountedPci["canvas"]) => canvas.getByTestId("readout").textContent!.replace(/\s+/g, "");
/** Drags a slider to a value and lets go: the picture follows while dragging (input), the value goes in on release (change). */
const slide = async (slider: HTMLElement, value: number) => {
  (slider as HTMLInputElement).value = String(value);
  fireEvent.input(slider);
  fireEvent.change(slider);
  await afterPaint();
};
/** The settings the candidate tried, from the tool mode's response. */
const tried = (mounted: MountedPci) => JSON.parse(mounted.pci.getResponse()!.base.string).tried;

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the speaker at 25 W, the listener at 100 m: 83.0 dB", async () => {
      expect(canvas.getByText(PROMPT)).toBeInTheDocument();
      expect(canvas.getByRole("region", { name: "Sound level simulation" })).toBeInTheDocument();
      expect(canvas.getByRole("img", { name: /^Speaker and a listener 100 m away/ })).toBeInTheDocument();
      expect(canvas.getByRole("combobox", { name: "Power" })).toHaveValue("25");
      expect(canvas.getByRole("slider", { name: "Distance" })).toHaveAttribute("aria-valuetext", "100 m, 83.0 dB");
      expect(level(canvas)).toBe("83.0dB");
      expect(canvas.getByRole("meter", { name: "Sound level meter" })).toHaveAttribute("aria-valuetext", "83.0 dB");
      expect(canvas.getByTestId("comparison")).toHaveTextContent("louder than busy traffic");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("one step further with the + button: 6 dB less for every doubling, so 0.8 dB less", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Distance larger" }));
      expect(level(canvas)).toBe("82.2dB");
      expect(canvas.getByRole("status")).toHaveTextContent("82.2 dB at 110 m from a source of 25 W.");
      expect(tried(mounted)).toEqual([{ power: 25, distance: 110, level: 82.2 }]);
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("four times the power: 6 dB more", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Power" }), "100 W");
      expect(level(canvas)).toBe("88.2dB");
      expect(tried(mounted)).toEqual([
        { power: 25, distance: 110, level: 82.2 },
        { power: 100, distance: 110, level: 88.2 },
      ]);
    });

    await step("back to the start with the − button", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Distance smaller" }));
      expect(canvas.getByRole("slider", { name: "Distance" })).toHaveValue("100");
      expect(tried(mounted)).toHaveLength(3);
    });
  },
};

export const ToolMode: Story = {
  args: { properties: { mode: "tool", powerInput: "slider", powerStep: "0.5" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the power on a slider: twice the power is 3 dB more", async () => {
      const power = canvas.getByRole("slider", { name: "Power" });
      expect(canvas.queryByRole("combobox")).toBeNull();
      await slide(power, 50);
      expect(level(canvas)).toBe("86.0dB");
      expect(power).toHaveAttribute("aria-valuetext", "50.0 W, 86.0 dB");
    });

    await step("fine steps of 0.5 W with the + button", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Power larger" }));
      expect(canvas.getByRole("slider", { name: "Power" })).toHaveValue("50.5");
    });

    await step("the distance on a slider, dragged to 400 m", async () => {
      await slide(canvas.getByRole("slider", { name: "Distance" }), 404);
      expect(canvas.getByRole("slider", { name: "Distance" })).toHaveValue("400");
      expect(level(canvas)).toBe("74.0dB");
    });

    await step("every setting the candidate stopped at, for research", async () => {
      const response = {
        powerUnit: "W",
        distanceUnit: "m",
        tried: [
          { power: 50, distance: 100, level: 86 },
          { power: 50.5, distance: 100, level: 86 },
          { power: 50.5, distance: 400, level: 74 },
        ],
      };
      expect(JSON.parse(pci.getResponse()!.base.string)).toEqual(response);
      expect(await lastChange(mounted, 3)).toEqual(pci.getResponse());
    });
  },
};

export const OnlyTheDistance: Story = {
  args: { properties: { control: "distance", power: "50" } },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.queryByRole("combobox", { name: "Power" })).toBeNull();
    expect(canvas.getByTestId("power-fixed")).toHaveTextContent("50 W (fixed)");
    expect(canvas.getByRole("slider", { name: "Distance" })).toBeEnabled();
  },
};

export const AnswerMode: Story = {
  args: { properties: ANSWER },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("the power is fixed, the distance is the answer, the target is on the meter", async () => {
      expect(canvas.queryByRole("combobox", { name: "Power" })).toBeNull();
      expect(canvas.getByTestId("power-fixed")).toHaveTextContent("50 W (fixed)");
      expect(canvas.getByText("Your answer")).toBeInTheDocument();
      expect(canvas.getByText("The distance you set is your answer.")).toBeInTheDocument();
      expect(canvas.getByTestId("target")).toHaveTextContent("Target: 70.0 dB");
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("the distance the candidate sets is the response, a float", async () => {
      await slide(canvas.getByRole("slider", { name: "Distance" }), 630);
      expect(level(canvas)).toBe("70.0dB");
      expect(pci.getResponse()).toEqual({ base: { float: 630 } });
      expect(await lastChange(mounted)).toEqual({ base: { float: 630 } });
    });

    await step("the correct response follows from the settings", async () => {
      // 50 W gives 70 dB at 630.8 m: the nearest step of the slider
      expect(pci.getCorrectResponse({ ...ANSWER })).toEqual({ base: { float: 630 } });
      expect(pci.getCorrectResponse({ ...ANSWER, targetLevel: "" })).toBeUndefined();
      expect(pci.getCorrectResponse({ targetLevel: "70" })).toBeUndefined(); // a tool has none
    });
  },
};

export const Dutch: Story = {
  args: { properties: { ...ANSWER, language: "nl" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("region", { name: "Simulatie van de geluidssterkte" })).toBeInTheDocument();
    expect(canvas.getByTestId("power-fixed")).toHaveTextContent("50 W (vast)");
    expect(canvas.getByTestId("target")).toHaveTextContent("Doel: 70,0 dB");
    await slide(canvas.getByRole("slider", { name: "Afstand" }), 630);
    // a decimal comma on the screen; the response does not depend on the language
    expect(level(canvas)).toBe("70,0dB");
    expect(canvas.getByRole("status")).toHaveTextContent("70,0 dB op 630 m van een bron van 50 W.");
    expect(canvas.getByTestId("comparison")).toHaveTextContent("harder dan gesprek");
    expect(pci.getResponse()).toEqual({ base: { float: 630 } });
  },
};

export const ExamReferenceIntensity: Story = {
  args: {
    properties: { referenceIntensity: "1.2e-12", source: "walrus", distanceMin: "10", distanceMax: "900", distanceStep: "10", distance: "400" },
  },
  play: async ({ canvasElement }) => {
    const { canvas } = await openPci(canvasElement);
    expect(canvas.getByRole("img", { name: /^Walrus and a listener 400 m away/ })).toBeInTheDocument();
    // I0 = 1.2·10⁻¹² W/m², as the 2025 vmbo exam's simulation: 0.8 dB under the standard 70.9 dB
    expect(level(canvas)).toBe("70.2dB");
    // 25 W gives more than 58 dB anywhere on the slider: a source of 58 dB at 400 m is much weaker
    await slide(canvas.getByRole("slider", { name: "Distance" }), 900);
    expect(level(canvas)).toBe("63.1dB");
  },
};

export const View2D: Story = {
  args: { properties: { view: "2d", source: "bird" } },
  play: async ({ canvasElement }) => {
    const { canvas, root } = await openPci(canvasElement);
    const picture = canvas.getByRole("img", { name: /^Bird and a listener/ });
    expect(picture).toHaveAttribute("data-view", "2d");
    expect(root.querySelector("canvas")).toBeNull();
    expect(picture.querySelectorAll("circle").length).toBeGreaterThanOrEqual(7);
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await userEvent.click(first.canvas.getByRole("button", { name: "Distance larger" }));
    await userEvent.click(first.canvas.getByRole("button", { name: "Distance larger" }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ power: null, distance: 120, tried: [{ power: 25, distance: 110 }, { power: 25, distance: 120 }] });

    const second = await remountPci(canvasElement, pci, { state });
    expect(second.canvas.getByRole("slider", { name: "Distance" })).toHaveValue("120");
    expect(level(second.canvas)).toBe("81.4dB");
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { properties: ANSWER, boundTo: { RESPONSE: { base: { float: 200 } } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the bound response sets the slider", async () => {
      await waitFor(() => expect(canvas.getByRole("slider", { name: "Distance" })).toHaveValue("200"));
      expect(pci.getResponse()).toEqual({ base: { float: 200 } });
    });

    await step("a response between two steps goes to the nearest", async () => {
      pci.setResponse({ base: { float: 633 } });
      await waitFor(() => expect(canvas.getByRole("slider", { name: "Distance" })).toHaveValue("630"));
      expect(pci.getResponse()).toEqual({ base: { float: 630 } });
    });

    await step("resetResponse goes back to the start", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.getByRole("slider", { name: "Distance" })).toHaveValue("100"));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: {
    properties: ANSWER,
    status: "solution",
    state: JSON.stringify({ state: { power: null, distance: 300, tried: [] }, log: [] }),
    responseDeclaration: { baseType: "float", cardinality: "single", correctResponse: { value: "630" } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct response replaces the candidate's answer
    await waitFor(() => expect(canvas.getByRole("slider", { name: "Distance" })).toHaveValue("630"));
    expect(level(canvas)).toBe("70.0dB");
    expect(pci.getResponse()).toEqual({ base: { float: 630 } });
  },
};

/** Two interactions in one item: each has its own store and settings. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const [name, args] of [["first", {}], ["second", { properties: { ...ANSWER, language: "nl" } }]] as const) {
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

    await userEvent.click(first.canvas.getByRole("button", { name: "Distance larger" }));
    await slide(second.canvas.getByRole("slider", { name: "Afstand" }), 630);

    expect(tried(first)).toEqual([{ power: 25, distance: 110, level: 82.2 }]);
    expect(level(first.canvas)).toBe("82.2dB");
    expect(second.pci.getResponse()).toEqual({ base: { float: 630 } });
    expect(level(second.canvas)).toBe("70,0dB");
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};
