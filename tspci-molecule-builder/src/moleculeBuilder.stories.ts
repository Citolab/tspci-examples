import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "Molecule builder",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

type Canvas = MountedPci["canvas"];
type Rec = { record: { name: string; base: { integer?: number; string?: string } | null }[] } | undefined;

const PROMPT = "Build a water molecule. Give every atom the right number of bonds.";
/** The string response. */
const key = (response: unknown) => (response as { base?: { string?: string } } | undefined)?.base?.string;
/** A field of the record response (PCI scoring). */
const field = (response: unknown, name: string) => (response as Rec)?.record.find((f) => f.name === name)?.base;
const add = (canvas: Canvas, name: RegExp) => userEvent.click(canvas.getByRole("button", { name }));
const status = (canvas: Canvas) => canvas.getByRole("status");
/** The structural formula, focused, for the keyboard. */
const structure = async (canvas: Canvas) => {
  await userEvent.click(canvas.getByRole("tab", { name: "Structural formula" }));
  const list = canvas.getByRole("listbox");
  list.focus();
  return list;
};

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByText(PROMPT)).toBeInTheDocument();
    // the palette: letters and the number of bonds, not only the colour
    expect(canvas.getByRole("group", { name: "Atoms" })).toBeInTheDocument();
    for (const name of ["Add hydrogen (H, 1 bond)", "Add carbon (C, 4 bonds)", "Add nitrogen (N, 3 bonds)", "Add oxygen (O, 2 bonds)"])
      expect(canvas.getByRole("button", { name })).toBeEnabled();
    expect(canvas.getByRole("tab", { name: "3D model" })).toHaveAttribute("aria-selected", "true");
    // the 3D model, or the message when the browser has no WebGL
    expect(canvas.getByTestId("model")).toBeInTheDocument();
    expect(canvas.getByTestId("formula")).toHaveAccessibleName("Formula: —");
    expect(pci.getResponse()).toBeUndefined();
  },
};

export const BuildWater: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    await step("O, then H twice: each H bonds to the selected O", async () => {
      await add(canvas, /^Add oxygen/);
      expect(status(canvas)).toHaveTextContent("O 1 added.");
      await add(canvas, /^Add hydrogen/);
      expect(status(canvas)).toHaveTextContent("H 2 added, bonded to O 1.");
      await add(canvas, /^Add hydrogen/);
      expect(key(await lastChange(mounted, 3))).toBe("H2O:O");
      expect(canvas.getByTestId("formula")).toHaveAccessibleName("Formula: H2O");
      expect(canvas.getByTestId("valence")).toHaveTextContent("Every atom has all its bonds.");
      expect(canvas.getByTestId("shape")).toHaveTextContent("O 1: bent, 104.5°");
    });
    await step("a third H: the oxygen is full, the H comes on its own", async () => {
      await add(canvas, /^Add hydrogen/);
      expect(status(canvas)).toHaveTextContent("O 1 has no free bonds: H 4 added without a bond.");
      expect(key(pci.getResponse())).toBe("H3O:O.[H]");
      expect(canvas.getByTestId("valence")).toHaveTextContent("Free bonds: H 4 (1)");
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(key(pci.getResponse())).toBe("H2O:O");
    });
  },
};

export const ConnectWithTheMouse: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Structural formula" }));
    await step("C, then O twice: single bonds, free bonds left", async () => {
      await add(canvas, /^Add carbon/);
      await add(canvas, /^Add oxygen/);
      await add(canvas, /^Add oxygen/);
      expect(key(pci.getResponse())).toBe("CO2:[O][C][O]");
      expect(canvas.getByTestId("valence")).toHaveTextContent("Free bonds: C 1 (2), O 2 (1), O 3 (1)");
    });
    await step("Connect, then the other atom: the bond becomes double", async () => {
      await userEvent.click(canvas.getByRole("option", { name: /^C 1/ }));
      await userEvent.click(canvas.getByRole("button", { name: "Connect" }));
      expect(canvas.getByRole("button", { name: "Connect" })).toHaveAttribute("aria-pressed", "true");
      expect(status(canvas)).toHaveTextContent("Connect from C 1: choose the other atom.");
      await userEvent.click(canvas.getByRole("option", { name: /^O 2/ }));
      expect(status(canvas)).toHaveTextContent("C 1 and O 2: double bond.");
      expect(canvas.getByRole("button", { name: "Connect" })).toHaveAttribute("aria-pressed", "false");
    });
    await step("a click on a bond cycles it", async () => {
      const bond = () => canvasElement.querySelector(".tspci-host")!.shadowRoot!.querySelector<SVGGElement>("[data-bond='1-3']")!;
      await userEvent.click(bond());
      expect(status(canvas)).toHaveTextContent("C 1 and O 3: double bond.");
      expect(key(pci.getResponse())).toBe("CO2:O=C=O");
      expect(canvas.getByTestId("valence")).toHaveTextContent("Every atom has all its bonds.");
      await userEvent.click(bond());
      await userEvent.click(bond());
      expect(status(canvas)).toHaveTextContent("C 1 and O 3: bond removed.");
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    const list = await structure(canvas);
    await step("letter keys build methane from the selected carbon", async () => {
      await userEvent.keyboard("chhhh");
      expect(key(pci.getResponse())).toBe("CH4:C");
      expect(list).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-atom-1$/));
      expect(canvas.getByRole("option", { name: "C 1, carbon: single bond to H 2, single bond to H 3, single bond to H 4 and single bond to H 5" })).toHaveAttribute("aria-selected", "true");
      expect(canvas.getByTestId("shape")).toHaveTextContent("C 1: tetrahedral, 109.5°");
    });
    await step("arrow keys go from atom to atom; Delete removes; Ctrl+Z undoes", async () => {
      await userEvent.keyboard("{ArrowUp}");
      expect(list).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-atom-4$/));
      expect(status(canvas)).toHaveTextContent("H 4, hydrogen: single bond to C 1");
      await userEvent.keyboard("{Delete}");
      expect(key(pci.getResponse())).toBe("CH3:[CH3]");
      expect(status(canvas)).toHaveTextContent("H 4 removed.");
      await userEvent.keyboard("{Control>}z{/Control}");
      expect(key(pci.getResponse())).toBe("CH4:C");
    });
    await step("Space connects two atoms; Escape cancels", async () => {
      await userEvent.keyboard("{ArrowRight} ");
      expect(status(canvas)).toHaveTextContent("Connect from H 2: choose the other atom.");
      await userEvent.keyboard("{Escape}");
      expect(status(canvas)).toHaveTextContent("Cancelled.");
      await userEvent.keyboard("{ArrowLeft} {ArrowRight} ");
      expect(status(canvas)).toHaveTextContent("C 1 and H 2: double bond.");
      expect(canvas.getByTestId("valence")).toHaveTextContent("C 1 (! 1 bond too many), H 2 (! 1 bond too many)");
    });
    await step("Shift + arrow moves an atom", async () => {
      await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
      expect(status(canvas)).toHaveTextContent("H 2 moved to column 2, row 0.");
    });
  },
};

export const Model3D: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    pci.setResponse({ base: { string: "N" } });
    const model = canvas.getByTestId("model");
    expect(model).toHaveAttribute("data-view", "3d"); // headless Chromium has WebGL (SwiftShader)
    await waitFor(() => expect(model).toHaveAccessibleName(/^3D model of the molecule, NH3: Build a water molecule/));
    model.focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowUp}");
    expect(model).toHaveAttribute("data-turns", "2");
    await userEvent.click(canvas.getByRole("button", { name: "Turn right" }));
    expect(model).toHaveAttribute("data-turns", "3");
    model.focus();
    await userEvent.keyboard("{PageDown}");
    expect(status(canvas)).toHaveTextContent("N 1, nitrogen: single bond to H 2, single bond to H 3 and single bond to H 4");
    expect(canvas.getByTestId("shape")).toHaveTextContent("N 1: pyramidal, 107°");
    await userEvent.keyboard("o");
    expect(key(pci.getResponse())).toBe("H3NO:N.[O]");
    await userEvent.click(canvas.getByRole("button", { name: "Reset view" }));
    expect(model).toHaveAttribute("data-turns", "0");
  },
};

export const Hidden: Story = {
  args: { properties: { showformula: "false", showvalence: "false", view: "2d", molecule: JSON.stringify({ elements: "H C Cl", solution: "ClC(Cl)(Cl)Cl" }) } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    expect(canvas.getByRole("tab", { name: "Structural formula" })).toHaveAttribute("aria-selected", "true");
    expect(canvas.getAllByRole("button", { name: /^Add / }).map((b) => b.textContent)).toEqual(["H1", "C4", "Cl1"]);
    canvas.getByRole("listbox").focus();
    await userEvent.keyboard("cl");
    // no formula, no free bonds: the candidate has to count
    expect(canvas.queryByTestId("formula")).toBeNull();
    expect(canvas.queryByTestId("valence")).toBeNull();
    expect(canvas.getByRole("option", { name: "C 1, carbon: single bond to Cl 2" })).toBeInTheDocument();
    expect(key(pci.getResponse())).toBe("CCl:[C]Cl");
  },
};

export const FormulaOrder: Story = {
  args: { properties: { view: "2d" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("shown as pupils learn it; the response in Hill order", async () => {
      pci.setResponse({ base: { string: "N" } });
      await waitFor(() => expect(canvas.getByTestId("formula")).toHaveAccessibleName("Formula: NH3"));
      expect(canvas.getByTestId("formula")).toHaveTextContent("NH3");
      expect(canvas.getByRole("listbox")).toHaveAccessibleName(/^Structural formula, NH3/);
      expect(key(pci.getResponse())).toBe("H3N:N");
    });
  },
};

export const FormulaOrderHill: Story = {
  args: { properties: { view: "2d", formulaorder: "hill" } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    pci.setResponse({ base: { string: "N" } });
    await waitFor(() => expect(canvas.getByTestId("formula")).toHaveAccessibleName("Formula: H3N"));
    expect(key(pci.getResponse())).toBe("H3N:N");
  },
};

export const PciScoring: Story = {
  args: {
    properties: {
      scoring: "pci", prompt: "Build an isomer of ethanol.",
      molecule: JSON.stringify({ elements: "H C O", solution: "CCO", checks: [{ type: "formula" }, { type: "valence" }, { type: "isomer", different: true, points: 2 }] }),
    },
  },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("ethanol itself: the formula and the valences, not an isomer", async () => {
      pci.setResponse({ base: { string: "OCC" } });
      await waitFor(() => expect(canvas.getByTestId("formula")).toHaveAccessibleName("Formula: C2H6O"));
      const r = pci.getResponse();
      expect([1, 2, 3].map((i) => field(r, `check${i}`)?.integer)).toEqual([1, 1, 0]);
      expect(field(r, "score")).toEqual({ integer: 2 });
      expect(field(r, "maxscore")).toEqual({ integer: 4 });
      expect(field(r, "smiles")).toEqual({ string: "CCO" });
    });
    await step("dimethyl ether: every check", async () => {
      pci.setResponse({ record: [{ name: "smiles", base: { string: "COC" } }] });
      await waitFor(() => expect(field(pci.getResponse(), "correct")).toEqual({ integer: 1 }));
      expect(field(pci.getResponse(), "score")).toEqual({ integer: 4 });
      expect(JSON.parse(field(pci.getResponse(), "molecule")!.string!).atoms).toHaveLength(9);
    });
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", prompt: "Bouw een molecuul ammoniak." } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Stikstof toevoegen (N, 3 bindingen)" }));
    expect(status(canvas)).toHaveTextContent("N 1 toegevoegd.");
    await userEvent.click(canvas.getByRole("button", { name: "Waterstof toevoegen (H, 1 binding)" }));
    expect(canvas.getByTestId("valence")).toHaveTextContent("Vrije bindingen: N 1 (2)");
    await userEvent.click(canvas.getByRole("tab", { name: "Structuurformule" }));
    await userEvent.click(canvas.getByRole("option", { name: /^N 1, stikstof: enkele binding met H 2; nog 2 vrije bindingen$/ }));
    pci.setResponse({ base: { string: "O" } });
    await userEvent.click(await waitFor(() => canvas.getByRole("option", { name: /^O 1, zuurstof/ })));
    // a decimal comma; the response stays the same in every language
    expect(canvas.getByTestId("shape")).toHaveTextContent("O 1: gebogen, 104,5°");
    expect(key(pci.getResponse())).toBe("H2O:O");
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await add(first.canvas, /^Add carbon/);
    await add(first.canvas, /^Add oxygen/);
    const state = first.pci.getState();
    expect(JSON.parse(state).state.molecule.atoms.map((a: { el: string }) => a.el)).toEqual(["C", "O"]);
    const second = await remountPci(canvasElement, pci, { state, properties: { view: "2d" } });
    expect(second.canvas.getAllByRole("option")).toHaveLength(2);
    expect(second.pci.getResponse()).toEqual(first.pci.getResponse());
    expect(key(second.pci.getResponse())).toBe("CO:[C][O]"); // no hydrogens: brackets
    expect(second.changes).toHaveLength(0);
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { string: "C2H4O2:CC(=O)O" } } }, properties: { view: "2d" } },
  play: async ({ canvasElement, step }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await step("the bound response is in the builder", async () => {
      await waitFor(() => expect(canvas.getAllByRole("option")).toHaveLength(8));
      expect(key(pci.getResponse())).toBe("C2H4O2:CC(=O)O");
      expect(canvas.getByRole("option", { name: /^C 2, carbon: single bond to C 1, double bond to O 3 and single bond to O 4$/ })).toBeInTheDocument();
    });
    await step("resetResponse: empty again", async () => {
      pci.resetResponse();
      await waitFor(() => expect(canvas.queryAllByRole("option")).toHaveLength(0));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

export const Solution: Story = {
  args: { status: "solution", properties: { view: "2d" }, state: JSON.stringify({ state: { molecule: { atoms: [{ id: 1, el: "C", x: 0, y: 0 }], bonds: [] } }, log: [] }) },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    // the author's molecule replaces the candidate's; nothing to change
    await waitFor(() => expect(key(pci.getResponse())).toBe("H2O:O"));
    expect(canvas.queryByRole("group", { name: "Atoms" })).toBeNull();
    expect(canvas.getByRole("listbox")).toHaveAttribute("aria-readonly", "true");
    canvas.getByRole("listbox").focus();
    await userEvent.keyboard("{Home}{Delete}c");
    expect(key(pci.getResponse())).toBe("H2O:O");
  },
};

export const SolutionFromTheDeclaration: Story = {
  args: { status: "solution", properties: { view: "2d" }, responseDeclaration: { cardinality: "single", baseType: "string", correctResponse: { value: ["CO2:O=C=O"] } } },
  play: async ({ canvasElement }) => {
    const { canvas, pci } = await openPci(canvasElement);
    await waitFor(() => expect(canvas.getAllByRole("option")).toHaveLength(3));
    expect(key(pci.getResponse())).toBe("CO2:O=C=O");
  },
};

/** Two interactions of this type on one page: each has its own molecule and response. */
export const TwoInstances: Story = {
  render: (args) => {
    const page = document.createElement("div");
    for (const id of ["first", "second"]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { ...args, properties: { view: "2d" } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await add(first.canvas, /^Add oxygen/);
    await add(second.canvas, /^Add nitrogen/);
    await add(second.canvas, /^Add hydrogen/);
    expect(key(first.pci.getResponse())).toBe("O:[O]");
    expect(key(second.pci.getResponse())).toBe("HN:[NH]");
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(2);
    // the ids of the options do not clash
    const ids = [first, second].map((m) => m.canvas.getByRole("option", { name: /^\w+ 1,/ }).id);
    expect(ids[0]).not.toBe(ids[1]);
  },
};

// --- Authoring mode: what an authoring system shows the item author (getAuthoringInstance)

export const AuthoringMode: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { scoring: "pci" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, changes } = await openAuthoring(canvasElement);
    const settings = () => JSON.parse(instance.getProperties().molecule!);

    await step("starts from the example: water, 3 of 3", async () => {
      expect(canvas.getByTestId("summary")).toHaveTextContent("The correct molecule scores 3 of 3.");
      expect(canvas.getByTestId("correct-response")).toHaveTextContent("H2O:O");
      expect(instance.validate!()).toEqual([]);
    });

    await step("build carbon dioxide instead", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Start again" }));
      expect(instance.validate!()).toEqual(["Build the correct molecule."]);
      canvas.getByRole("listbox").focus();
      await userEvent.keyboard("coo {ArrowRight} {ArrowLeft} {ArrowLeft} ");
      expect(settings().solution).toBe("O=C=O");
      expect(canvas.getByTestId("correct-response")).toHaveTextContent("CO2:O=C=O");
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("the palette: without oxygen the molecule cannot be built", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Atoms in the palette" }));
      await userEvent.click(canvas.getByTestId("element-O"));
      expect(instance.validate!()).toEqual(["The correct molecule uses O, which is not in the palette."]);
      await userEvent.click(canvas.getByTestId("element-O"));
      await userEvent.click(canvas.getByTestId("element-N"));
      expect(settings().elements).toBe("H C O");
    });

    await step("the checks: a double bond C=O, twice", async () => {
      await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
      await userEvent.click(canvas.getByRole("button", { name: "+ Add a check" }));
      await userEvent.selectOptions(canvas.getByTestId("check-3-type"), "Has bonds of a kind");
      await userEvent.selectOptions(canvas.getByTestId("check-3-a"), "C");
      await userEvent.selectOptions(canvas.getByTestId("check-3-b"), "O");
      expect(settings().checks[3]).toEqual({ type: "bond", order: 2, count: 1, points: 1, a: "C", b: "O" });
      expect(canvas.getByTestId("summary")).toHaveTextContent("The correct molecule scores 4 of 4.");
      await userEvent.selectOptions(canvas.getByTestId("check-3-order"), "triple bond");
      expect(instance.validate!()).toEqual(["The correct molecule does not pass check 4."]);
    });
  },
};

export const AuthoringDutch: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl" },
  play: async ({ canvasElement }) => {
    const { canvas, instance } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("tab", { name: "Goede molecuul" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("tab", { name: "Checks" }));
    expect(canvas.getByText(/Het item scoort \(MATCH_CORRECT/)).toBeInTheDocument();
    expect(instance.validate!()).toEqual([]);
  },
};
