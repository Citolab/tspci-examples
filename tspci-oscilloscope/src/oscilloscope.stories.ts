import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, fireEvent, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Oscilloscope",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "The amplifier makes the signal three times as strong; the frequency stays the same. Set the amplified signal on the screen.";

/** What a knob shows next to its name. */
const shown = (canvas: MountedPci["canvas"], knob: "frequency" | "amplitude") => canvas.getByTestId(`value-${knob}`).textContent;
/**
 * Turns a knob to a value, as dragging it or its keys do. The knobs are native range inputs: the browser itself moves
 * them on the arrow keys, Page Up/Down, Home and End, which user-event does not simulate (the Playwright tests of the
 * built bundle press the real keys).
 */
const slide = (slider: HTMLElement, value: number) => {
  (slider as HTMLInputElement).value = String(value);
  fireEvent.input(slider);
};
/** A number of clicks on a button. */
const press = async (button: HTMLElement, times: number) => {
  for (let i = 0; i < times; i++) await userEvent.click(button);
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(PROMPT)).toBeInTheDocument();
    // the screen describes itself, without the numbers of the reference
    const screen = canvas.getByRole("img", { name: /^Oscilloscope screen\. A grid of 10 by 8 divisions with the reference signal/ });
    expect(screen.getAttribute("aria-label")).toContain("Your signal: 2.0 vibrations, amplitude 2.0 div");
    expect(screen.getAttribute("aria-label")).not.toContain("4.2");
    expect(canvas.getByTestId("trace-reference")).toBeInTheDocument();
    expect(canvas.getByTestId("trace-candidate")).toBeInTheDocument();
    expect(canvas.getByRole("slider", { name: "Number of vibrations" })).toHaveAttribute("aria-valuetext", "2.0 vibrations");
    expect(canvas.getByRole("slider", { name: "Amplitude" })).toHaveAttribute("aria-valuetext", "2.0 div");
    expect(shown(canvas, "frequency")).toBe("2.0 vibrations");
    expect(canvas.getByRole("button", { name: /Reset/ })).toBeDisabled();
    // the candidate starts at the start setting: not a response yet
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const UsingTheKnobs: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const amplitude = canvas.getByRole("slider", { name: "Amplitude" });

    await step("dragging a knob stops on its steps", async () => {
      slide(amplitude, 2.31);
      await waitFor(() => expect(shown(canvas, "amplitude")).toBe("2.3 div"));
      expect(await lastChange(mounted)).toEqual({ list: { float: [2, 2.3] } });
    });

    await step("+ and − take a fine step", async () => {
      await press(canvas.getByRole("button", { name: "Number of vibrations higher" }), 22);
      await press(canvas.getByRole("button", { name: "Amplitude higher" }), 8);
      await press(canvas.getByRole("button", { name: "Amplitude lower" }), 1);
      await waitFor(() => expect(shown(canvas, "frequency")).toBe("4.2 vibrations"));
      expect(shown(canvas, "amplitude")).toBe("3.0 div");
      expect(pci.getResponse()).toEqual({ list: { float: [4.2, 3] } });
    });

    await step("the trace follows the knobs", async () => {
      const before = canvas.getByTestId("trace-candidate").getAttribute("d");
      await userEvent.click(canvas.getByRole("button", { name: "Number of vibrations lower" }));
      await waitFor(() => expect(canvas.getByTestId("trace-candidate").getAttribute("d")).not.toBe(before));
    });

    await step("Reset goes back to the start: no response", async () => {
      await userEvent.click(canvas.getByRole("button", { name: /Reset/ }));
      await waitFor(() => expect(shown(canvas, "frequency")).toBe("2.0 vibrations"));
      expect(pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
    });
  },
};

export const ResponseValues: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the lowest and highest a knob goes: on its steps, rounded to the decimals of the step
    slide(canvas.getByRole("slider", { name: "Number of vibrations" }), 0);
    slide(canvas.getByRole("slider", { name: "Amplitude" }), 100);
    await waitFor(() => expect(pci.getResponse()).toEqual({ list: { float: [0.5, 4] } }));
    expect(canvas.getByRole("button", { name: "Number of vibrations lower" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Amplitude higher" })).toBeDisabled();
    // three steps of 0.1 from 0.5 are 0.8, not 0.8000000000000002
    await press(canvas.getByRole("button", { name: "Number of vibrations higher" }), 3);
    await waitFor(() => expect(pci.getResponse()).toEqual({ list: { float: [0.8, 4] } }));
  },
};

export const HiddenValues: Story = {
  args: { properties: { showValues: "false" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the candidate reads the screen: no numbers at the knobs, the position for a screen reader
    expect(canvas.queryByTestId("value-frequency")).toBeNull();
    const frequency = canvas.getByRole("slider", { name: "Number of vibrations" });
    expect(frequency).toHaveAttribute("aria-valuetext", "position 16 of 76");
    expect(canvas.getByRole("img", { name: /Oscilloscope screen/ }).getAttribute("aria-label")).not.toMatch(/\d\.\d/);
    await userEvent.click(canvas.getByRole("button", { name: "Number of vibrations higher" }));
    await waitFor(() => expect(frequency).toHaveAttribute("aria-valuetext", "position 17 of 76"));
    expect(pci.getResponse()).toEqual({ list: { float: [2.1, 2] } });
  },
};

export const HertzAndVolts: Story = {
  args: {
    properties: {
      waveform: "square", frequencyUnit: "hertz", amplitudeUnit: "volts", timePerDiv: "1", voltsPerDiv: "2", showScale: "true",
      referenceFrequency: "500", referenceAmplitude: "4", startFrequency: "300", startAmplitude: "6",
      frequencyMin: "100", frequencyMax: "1000", frequencyStep: "10", amplitudeMin: "1", amplitudeMax: "8", amplitudeStep: "0.5",
      correctFrequency: "", correctAmplitude: "",
      prompt: "Set a higher tone with less loudness.",
    },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("slider", { name: "Frequency" })).toHaveAttribute("aria-valuetext", "300 Hz");
    expect(shown(canvas, "amplitude")).toBe("6.0 V");
    expect(canvas.getByTestId("scale")).toHaveTextContent(/time base 1 ms\/div\s*voltage 2 V\/div/);
    // 300 Hz over 10 ms is 3 vibrations; 6 V at 2 V/div is 3 divisions (120 px) up from the centre line at 160
    expect(canvas.getByTestId("trace-candidate").getAttribute("d")).toMatch(/^M0 160L0 40L66\.67 40L66\.67 280/);
    slide(canvas.getByRole("slider", { name: "Frequency" }), 312);
    await userEvent.click(canvas.getByRole("button", { name: "Amplitude lower" }));
    await waitFor(() => expect(pci.getResponse()).toEqual({ list: { float: [310, 5.5] } }));
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Stel het versterkte signaal in." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("img", { name: /^Scherm van de oscilloscoop\. Een raster van 10 bij 8 hokjes met het referentiesignaal/ })).toBeInTheDocument();
    expect(canvas.getByText("Referentiesignaal")).toBeInTheDocument();
    expect(canvas.getByText("Jouw signaal")).toBeInTheDocument();
    await press(canvas.getByRole("button", { name: "Aantal trillingen hoger" }), 2);
    await waitFor(() => expect(shown(canvas, "frequency")).toBe("2,2 trillingen"));
    expect(shown(canvas, "amplitude")).toBe("2,0 hokjes");
    // the response is the same in every language
    expect(pci.getResponse()).toEqual({ list: { float: [2.2, 2] } });
    expect(canvas.getByRole("button", { name: /Opnieuw/ })).toBeEnabled();
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await press(first.canvas.getByRole("button", { name: "Number of vibrations higher" }), 3);
    await press(first.canvas.getByRole("button", { name: "Amplitude lower" }), 1);
    await waitFor(() => expect(first.pci.getResponse()).toEqual({ list: { float: [2.3, 1.9] } }));
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ frequency: 2.3, amplitude: 1.9, touched: true });
    expect(JSON.parse(state).log).toHaveLength(4);

    const second = await remountPci(canvasElement, pci, { state });
    expect(shown(second.canvas, "frequency")).toBe("2.3 vibrations");
    expect(shown(second.canvas, "amplitude")).toBe("1.9 div");
    expect(second.pci.getResponse()).toEqual({ list: { float: [2.3, 1.9] } });
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { list: { float: [3.3, 2.5] } } } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);

    await step("the bound response sets the knobs", async () => {
      await waitFor(() => expect(shown(canvas, "frequency")).toBe("3.3 vibrations"));
      expect(shown(canvas, "amplitude")).toBe("2.5 div");
      expect(pci.getResponse()).toEqual({ list: { float: [3.3, 2.5] } });
    });

    await step("setResponse stays within the knobs' ranges", async () => {
      pci.setResponse({ list: { float: [99, -1] } });
      await waitFor(() => expect(shown(canvas, "frequency")).toBe("8.0 vibrations"));
      expect(pci.getResponse()).toEqual({ list: { float: [8, 0.2] } });
    });

    await step("resetResponse goes back to the start", async () => {
      pci.resetResponse();
      await waitFor(() => expect(shown(canvas, "frequency")).toBe("2.0 vibrations"));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: {
    status: "solution",
    state: JSON.stringify({ state: { frequency: 6, amplitude: 1, touched: true }, log: [] }),
    responseDeclaration: { baseType: "float", cardinality: "ordered", correctResponse: { value: ["4.2", "3"] } },
  },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the correct response replaces the candidate's setting; the knobs cannot be turned
    await waitFor(() => expect(shown(canvas, "frequency")).toBe("4.2 vibrations"));
    expect(shown(canvas, "amplitude")).toBe("3.0 div");
    expect(pci.getResponse()).toEqual({ list: { float: [4.2, 3] } });
    expect(canvas.getByRole("slider", { name: "Number of vibrations" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Amplitude higher" })).toBeDisabled();
  },
};

/** Two oscilloscopes in one item: each has its own knobs, response and state. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const name of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = name;
      slot.appendChild(mountPci(pci, args));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);

    await userEvent.click(first.canvas.getByRole("button", { name: "Amplitude higher" }));
    await waitFor(() => expect(first.pci.getResponse()).toEqual({ list: { float: [2, 2.1] } }));
    expect(second.pci.getResponse()).toBeUndefined();
    expect(shown(second.canvas, "amplitude")).toBe("2.0 div");
    expect(second.changes).toHaveLength(0);

    await press(second.canvas.getByRole("button", { name: "Number of vibrations higher" }), 2);
    await waitFor(() => expect(second.pci.getResponse()).toEqual({ list: { float: [2.2, 2] } }));
    expect(first.pci.getResponse()).toEqual({ list: { float: [2, 2.1] } });
    expect(JSON.parse(first.pci.getState()).state).toEqual({ frequency: 2, amplitude: 2.1, touched: true });
    expect(JSON.parse(second.pci.getState()).state).toEqual({ frequency: 2.2, amplitude: 2, touched: true });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(2);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

/** The authoring mode, as an authoring system shows it after "Set up the signals…". */
export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);

    await step("starts on the correct setting, with all three signals on the screen", async () => {
      expect(canvas.getByRole("tab", { name: "Correct setting" })).toHaveAttribute("aria-selected", "true");
      expect(shown(canvas, "amplitude")).toBe("3.0 div");
      for (const signal of ["reference", "start", "correct"]) expect(canvas.getByTestId(`trace-${signal}`)).toBeInTheDocument();
      expect(instance.validate()).toEqual([]);
    });

    await step("the author sets the reference with the knobs", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Reference signal" }));
      slide(canvas.getByRole("slider", { name: "Number of vibrations" }), 4.5);
      await userEvent.click(canvas.getByRole("button", { name: "Amplitude higher" }));
      await waitFor(() => expect(instance.getProperties()).toMatchObject({ referenceFrequency: "4.5", referenceAmplitude: "1.1" }));
      expect(changes).toHaveLength(2);
    });

    await step("the candidate's start, and no correct setting", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Candidate's start" }));
      await userEvent.click(canvas.getByRole("button", { name: "Number of vibrations lower" }));
      await userEvent.click(canvas.getByRole("button", { name: "No correct setting" }));
      expect(instance.getProperties()).toEqual({
        referenceFrequency: "4.5", referenceAmplitude: "1.1", startFrequency: "1.9", startAmplitude: "2", correctFrequency: "", correctAmplitude: "",
      });
      expect(canvas.queryByTestId("trace-correct")).toBeNull();
    });

    await step("a correct setting again starts at the start", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Add a correct setting" }));
      expect(instance.getProperties()).toMatchObject({ correctFrequency: "1.9", correctAmplitude: "2" });
      expect(canvas.getByRole("tab", { name: "Correct setting" })).toHaveAttribute("aria-selected", "true");
    });
  },
};

/** A correct setting the knobs cannot reach is a problem for the author. */
export const AuthoringOutOfReach: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { correctFrequency: "20", correctAmplitude: "3" } },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(instance.validate()).toEqual(["De goede instelling ligt buiten het bereik van de knoppen: de kandidaat kan hem niet instellen."]);
    expect(canvas.getByTestId("problem")).toBeInTheDocument();
  },
};
