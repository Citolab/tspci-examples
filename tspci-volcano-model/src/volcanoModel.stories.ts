// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountPci, openPci, remountPci, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Volcano model",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

const PROMPT = "Pour mashed potato into the U-tube, then add an effervescent tablet and close the tube. What happens to the purée?";
/** the smooth animation takes about 4.5 s */
const SLOW = { timeout: 8000 };

/** A field of the record response. */
const field = (mounted: MountedPci, name: string) => {
  const response = mounted.pci.getResponse() as any;
  const item = response?.record?.find((f: any) => f.name === name);
  return item ? Object.values(item.base)[0] : undefined;
};
const experiments = (mounted: MountedPci) => JSON.parse(field(mounted, "experiments") as string);

/** One experiment in the step-by-step mode: pour, (tablets), start, three times next. */
const runSteps = async ({ canvas }: MountedPci, pour: string, start: string, next: string, tablets?: string) => {
  await userEvent.click(canvas.getByRole("button", { name: pour }));
  if (tablets) await userEvent.click(canvas.getByRole("radio", { name: tablets }));
  await userEvent.click(canvas.getByRole("button", { name: start }));
  for (let i = 0; i < 3; i++) await userEvent.click(canvas.getByRole("button", { name: new RegExp(`^${next}`) }));
};

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a U-tube with water, three kinds of mashed potato, step 2 not yet possible", async () => {
      expect(canvas.getByText(PROMPT)).toBeInTheDocument();
      expect(canvas.getByRole("region", { name: "Volcano model" })).toBeInTheDocument();
      expect(canvas.getByRole("img", { name: "A U-shaped glass tube with water. No purée yet." })).toBeInTheDocument();
      expect(canvas.getAllByRole("button", { name: /^Pour / })).toHaveLength(3);
      expect(canvas.getByRole("button", { name: "Put in the tablet and close" })).toBeDisabled();
      expect(canvas.getByRole("button", { name: "Start again" })).toBeDisabled();
      expect(canvas.getByText("No experiments yet.")).toBeInTheDocument();
      expect(pci.getResponse()).toBeUndefined();
    });

    await step("step 1: the stiff mashed potato is poured into the right branch", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Pour stiff mashed potato" }));
      expect(canvas.getByRole("button", { name: "Pour stiff mashed potato" })).toHaveAttribute("aria-pressed", "true");
      expect(canvas.getByRole("button", { name: "Pour runny mashed potato" })).toBeDisabled();
      await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("The stiff mashed potato is in the right branch, on top of the water."));
      expect(canvas.getByRole("img", { name: /The right branch holds stiff mashed potato/ })).toBeInTheDocument();
    });

    await step("step 2 with two tablets: the experiment is in the response straight away", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "2 tablets" }));
      await userEvent.click(canvas.getByRole("button", { name: "Put in 2 tablets and close" }));
      expect(experiments(mounted)).toEqual([{ viscosity: "compact", tablets: 2, outcome: "explosion", eruption: "explosive" }]);
      expect(field(mounted, "count")).toBe(1);
      expect(field(mounted, "outcomes")).toBe("explosion");
      expect(field(mounted, "score")).toBeUndefined(); // no task
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
      expect(canvas.getByRole("status")).toHaveTextContent("2 tablets drop into the water of the left branch");
    });

    await step("the animation ends with the outcome and the real eruption it models", async () => {
      await waitFor(() => expect(canvas.getByTestId("outcome")).toHaveTextContent("Explosion"), SLOW);
      expect(canvas.getByTestId("reality")).toHaveTextContent("In reality: Explosive eruption.");
      expect(canvas.getByRole("status")).toHaveTextContent("Explosion: The pressure builds up");
      expect(canvas.getByTestId("experiments")).toHaveTextContent("Stiff2Explosionexplosive");
      expect(canvas.getByRole("button", { name: "Put in 2 tablets and close" })).toBeDisabled();
    });

    await step("start again: water only, the experiment stays", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(canvas.getByRole("img", { name: "A U-shaped glass tube with water. No purée yet." })).toBeInTheDocument();
      expect(canvas.queryByTestId("outcome")).toBeNull();
      expect(field(mounted, "resets")).toBe(1);
      expect(field(mounted, "count")).toBe(1);
      expect(canvas.getByRole("button", { name: "Pour runny mashed potato" })).toBeEnabled();
    });
  },
};

export const StepByStep: Story = {
  args: { properties: { animation: "steps" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("pouring is immediate; the eruption waits for the candidate", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Pour runny mashed potato" }));
      expect(canvas.getByRole("status")).toHaveTextContent("The runny mashed potato is in the right branch");
      await userEvent.click(canvas.getByRole("button", { name: "Put in the tablet and close" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Stage 1 of 4. The tablet drops into the water of the left branch");
      expect(canvas.queryByTestId("outcome")).toBeNull();
      expect(canvas.getByTestId("experiments")).toHaveTextContent("Runny1……");
    });

    await step("each stage is a button press, with its narration", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Next step (Stage 2 of 4)" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Stage 2 of 4. Bubbles of gas rise");
      await userEvent.click(canvas.getByRole("button", { name: "Next step (Stage 3 of 4)" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Stage 3 of 4. The gas pushes the water down on the left");
      await userEvent.click(canvas.getByRole("button", { name: "Next step (Stage 4 of 4)" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Stage 4 of 4. Lava flow: The purée overflows");
      expect(canvas.getByTestId("outcome")).toHaveTextContent("Lava flow");
      expect(canvas.getByTestId("reality")).toHaveTextContent("Effusive eruption");
      expect(canvas.queryByRole("button", { name: /^Next step/ })).toBeNull();
      expect(experiments(mounted)).toEqual([{ viscosity: "fluid", tablets: 1, outcome: "flow", eruption: "effusive" }]);
    });
  },
};

export const AsTheOriginal: Story = {
  args: { properties: { viscosityLevels: "2", maxTablets: "1", showEruptionType: "false", animation: "steps" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("two kinds of purée, one tablet, no eruption types", async () => {
      expect(canvas.getAllByRole("button", { name: /^Pour / }).map((b) => b.textContent)).toEqual(["Pour runny mashed potato", "Pour stiff mashed potato"]);
      expect(canvas.queryByRole("radio")).toBeNull();
    });

    await step("stiff mashed potato makes a dome", async () => {
      await runSteps(mounted, "Pour stiff mashed potato", "Put in the tablet and close", "Next step");
      expect(canvas.getByTestId("outcome")).toHaveTextContent("Dome");
      expect(canvas.queryByTestId("reality")).toBeNull();
      expect(canvas.getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
      expect(canvas.queryByRole("columnheader", { name: "Eruption type" })).toBeNull();
      expect(experiments(mounted)).toEqual([{ viscosity: "compact", tablets: 1, outcome: "dome", eruption: "explosive" }]);
    });
  },
};

export const ViscosityTask: Story = {
  args: { properties: { task: "viscosity", animation: "steps" } },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;

    await step("a matching task for each outcome; answering alone gives a response", async () => {
      expect(canvas.getByText("Which mashed potato gives each result?")).toBeInTheDocument();
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Lava flow" }), "Runny");
      expect(field(mounted, "answers")).toBe("flow=fluid");
      expect(field(mounted, "score")).toBe(1);
      expect(field(mounted, "maxscore")).toBe(3);
      expect(field(mounted, "correct")).toBe(0);
      expect(field(mounted, "count")).toBe(0);
      expect(await lastChange(mounted)).toEqual(pci.getResponse());
    });

    await step("a wrong answer, then all of them right (medium or stiff both explode)", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Dome" }), "Runny");
      expect(field(mounted, "score")).toBe(1);
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Dome" }), "Stiff");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Explosion" }), "Thick");
      expect(field(mounted, "answers")).toBe("flow=fluid;dome=compact;explosion=medium");
      expect(field(mounted, "score")).toBe(3);
      expect(field(mounted, "correct")).toBe(1);
    });
  },
};

export const EruptionTaskWithOwnRules: Story = {
  args: {
    properties: {
      task: "eruption",
      viscosityLevels: "2",
      maxTablets: "2",
      rules: "fluid = flow; compact = dome; compact 2 = explosion",
      key: "dome = explosive | effusive",
      animation: "steps",
    },
  },
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;

    await step("the author's rules: stiff purée with two tablets explodes", async () => {
      await runSteps(mounted, "Pour stiff mashed potato", "Put in 2 tablets and close", "Next step", "2 tablets");
      expect(canvas.getByTestId("outcome")).toHaveTextContent("Explosion");
    });

    await step("the author's key accepts both eruption types for a dome", async () => {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Lava flow" }), "Effusive eruption");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Dome" }), "Effusive eruption");
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Explosion" }), "Explosive eruption");
      expect(field(mounted, "answers")).toBe("flow=effusive;dome=effusive;explosion=explosive");
      expect(field(mounted, "score")).toBe(3);
      expect(field(mounted, "correct")).toBe(1);
    });
  },
};

export const French: Story = {
  args: { properties: { language: "fr", animation: "steps", task: "eruption" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Modèle de volcan" })).toBeInTheDocument();
    await runSteps(mounted, "Verser la purée fluide", "Introduire 3 cachets et boucher", "Étape suivante", "3 cachets");
    expect(canvas.getByTestId("outcome")).toHaveTextContent("Coulée");
    expect(canvas.getByTestId("reality")).toHaveTextContent("Dans la réalité : Éruption effusive.");
    expect(canvas.getByRole("button", { name: "Rétablir les conditions initiales" })).toBeEnabled();
    expect(canvas.getByRole("combobox", { name: "Dôme" })).toBeInTheDocument();
    expect(experiments(mounted)).toEqual([{ viscosity: "fluid", tablets: 3, outcome: "flow", eruption: "effusive" }]);
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", animation: "steps" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByRole("region", { name: "Vulkaanmodel" })).toBeInTheDocument();
    await runSteps(mounted, "Giet dikke puree", "3 tabletten erin en afsluiten", "Volgende stap", "3 tabletten");
    expect(canvas.getByTestId("outcome")).toHaveTextContent("Explosie");
    expect(canvas.getByTestId("reality")).toHaveTextContent("In werkelijkheid: Explosieve uitbarsting.");
    expect(canvas.getByTestId("experiments")).toHaveTextContent("Dik3Explosieexplosief");
  },
};

export const RestoreState: Story = {
  args: { properties: { task: "viscosity", animation: "steps" } },
  play: async ({ canvasElement, step }) => {
    const first = await openPci(canvasElement);

    await step("two experiments and an answer", async () => {
      await runSteps(first, "Pour runny mashed potato", "Put in the tablet and close", "Next step");
      await userEvent.click(first.canvas.getByRole("button", { name: "Start again" }));
      await runSteps(first, "Pour thick mashed potato", "Put in 3 tablets and close", "Next step", "3 tablets");
      await userEvent.selectOptions(first.canvas.getByRole("combobox", { name: "Explosion" }), "Thick");
    });

    await step("the candidate comes back: the tube, the experiments and the answer are as they left them", async () => {
      const response = first.pci.getResponse();
      const again = await remountPci(canvasElement, pci, { properties: { task: "viscosity", animation: "steps" }, state: first.pci.getState() });
      expect(again.pci.getResponse()).toEqual(response);
      expect(again.canvas.getByTestId("outcome")).toHaveTextContent("Explosion");
      expect(again.canvas.getByTestId("experiments")).toHaveTextContent("Runny1Lava floweffusive");
      expect(again.canvas.getByRole("combobox", { name: "Explosion" })).toHaveValue("medium");
      expect(field(again, "resets")).toBe(1);
      expect(again.canvas.getByRole("button", { name: "Start again" })).toBeEnabled();
    });
  },
};

export const RestoreResponse: Story = {
  args: {
    properties: { task: "eruption" },
    boundTo: {
      RESPONSE: {
        record: [
          { name: "experiments", base: { string: JSON.stringify([{ viscosity: "fluid", tablets: 1, outcome: "flow", eruption: "effusive" }]) } },
          { name: "answers", base: { string: "flow=effusive" } },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByTestId("outcome")).toHaveTextContent("Lava flow");
    expect(canvas.getByRole("combobox", { name: "Lava flow" })).toHaveValue("effusive");
    expect(field(mounted, "score")).toBe(1);
    expect(field(mounted, "maxscore")).toBe(3);
    expect(mounted.changes).toHaveLength(0);
  },
};

export const Review: Story = {
  args: {
    status: "review",
    properties: { task: "viscosity" },
    state: JSON.stringify({
      state: {
        phase: "erupted",
        viscosity: "compact",
        tablets: 1,
        experiments: [{ viscosity: "compact", tablets: 1, outcome: "dome", eruption: "explosive" }],
        answers: { dome: "compact" },
        resets: 0,
      },
      log: [],
    }),
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByText("Review: the simulation cannot be changed.")).toBeInTheDocument();
    expect(canvas.getByTestId("outcome")).toHaveTextContent("Dome");
    for (const b of canvas.getAllByRole("button")) expect(b).toBeDisabled();
    expect(canvas.getByRole("combobox", { name: "Dome" })).toBeDisabled();
    expect(canvas.getByRole("combobox", { name: "Dome" })).toHaveValue("compact");
    expect(field(mounted, "score")).toBe(1);
  },
};
