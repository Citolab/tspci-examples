import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  afterPaint, focusedIn, lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, retype, type AuthoringArgs, type MountedPci, type PciArgs,
} from "../../.storybook/tspci";
import pci from "./index";
import { SCENES } from "./scenes";

const meta = {
  title: "Hazard spotting",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// The building site (the default scene) has 9 spots. Its hazards, in the order of the response: h1 railing, h2 materials,
// h3 wheels, h4 ladder, h5 helmet, h6 hole; its look-alikes: the sign, the wheelbarrow, the pallet. In reading order
// (the keyboard): railing, materials, sign, ladder, wheelbarrow, wheels, hole, helmet, pallet.
const SCAFFOLD = SCENES.scaffold.spots;
const at = (id: string, scene = SCAFFOLD) => scene.find((spot) => spot.id === id)!.at;

const sceneOf = (m: MountedPci) => m.root.querySelector<SVGSVGElement>('[data-testid="scene"]')!;
const byTestId = (m: MountedPci, id: string) => m.root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const markers = (m: MountedPci) => Array.from(m.root.querySelectorAll<SVGGElement>('[data-testid="marker"]'));

type Field = { name: string; base?: { boolean?: boolean; integer?: number; string?: string } };
/** The response as a plain object: { found: 1, total: 6, wrong: 0, correct: false, h1: true, …, marks: "railing" } */
const plain = (response: unknown) =>
  Object.fromEntries(((response as { record?: Field[] })?.record ?? []).map((f) => [f.name, f.base?.boolean ?? f.base?.integer ?? f.base?.string]));
const recordWith = (marks: string) => ({ record: [{ name: "marks", base: { string: marks } }] });

/** The point on the screen of a point in the scene (800 × 500). */
const screenPoint = (svg: SVGSVGElement, [x, y]: [number, number]) => new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);

/**
 * A tap as the browser reports it: pointer down and up, `move` CSS px apart, by a mouse or a finger (or a pen).
 */
async function tapAt(svg: SVGSVGElement, point: [number, number], { pointerType = "mouse", move = 0, pointerId = 1 } = {}) {
  const p = screenPoint(svg, point);
  const init = { pointerId, pointerType, isPrimary: true, button: 0, bubbles: true, cancelable: true, composed: true };
  svg.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: p.x, clientY: p.y, buttons: 1 }));
  if (move) svg.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: p.x + move, clientY: p.y, buttons: 1 }));
  svg.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: p.x + move, clientY: p.y, buttons: 0 }));
  await afterPaint();
}

/** A key pressed on the picture (userEvent.keyboard does not reach into the shadow root). */
async function press(svg: SVGSVGElement, key: string, times = 1) {
  for (let i = 0; i < times; i++) svg.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true }));
  await afterPaint();
}

/** Hazard spotting to try out yourself (no test runs on it): with a mouse, a touchscreen or the keyboard. */
export const ToTry: Story = {
  name: "Hazard spotting, to try",
};

/** Without settings: the building site, every hazard counts, no limit, a mark on a safe spot costs a point. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    expect(canvas.queryByRole("heading", { level: 2 })).toBeNull();
    expect(canvas.getByText("Look carefully at the picture. Tap every unsafe situation.")).toBeInTheDocument();
    expect(canvas.getByText("Careful: a mark on a safe spot costs a point.")).toBeInTheDocument();
    expect(canvas.getByRole("application", { name: "Picture: Building site with a mobile scaffold" })).toBe(sceneOf(mounted));
    expect(sceneOf(mounted).tabIndex).toBe(0);
    expect(byTestId(mounted, "count")).toHaveTextContent("0 marks");
    expect(canvas.getByText("No marks yet.")).toBeInTheDocument();
    // nothing answered, nothing reported, and no hazard named before answering
    expect(pci.getResponse()).toBeUndefined();
    expect(mounted.root.textContent).not.toContain("toe board");
  },
};

export const TapToMark: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const svg = sceneOf(mounted);

    await step("a tap on a hazard: a numbered marker, and the response", async () => {
      await tapAt(svg, at("railing"));
      expect(plain(await lastChange(mounted))).toEqual({
        found: 1, total: 6, wrong: 0, correct: false, h1: true, h2: false, h3: false, h4: false, h5: false, h6: false, marks: "railing",
      });
      expect(markers(mounted)).toHaveLength(1);
      expect(markers(mounted)[0]).toHaveTextContent("1");
      expect(byTestId(mounted, "count")).toHaveTextContent("1 mark");
      expect(canvas.getByRole("button", { name: "Remove mark 1: the top of the scaffold" })).toBeInTheDocument();
      expect(byTestId(mounted, "live")).toHaveTextContent("Mark 1 placed: the top of the scaffold.");
    });

    await step("a tap on a look-alike and one on no spot at all: marks on a safe spot", async () => {
      await tapAt(svg, at("sign"));
      await tapAt(svg, [700, 150]); // the wall
      expect(plain(pci.getResponse())).toMatchObject({ found: 1, wrong: 2, correct: false, marks: "railing; sign; 700,150" });
      expect(canvas.getByRole("button", { name: "Remove mark 3: a spot at the top right" })).toBeInTheDocument();
    });

    await step("a tap on a marker removes it; a tap elsewhere on a marked spot too", async () => {
      await tapAt(svg, [706, 154]);
      expect(plain(pci.getResponse())).toMatchObject({ wrong: 1, marks: "railing; sign" });
      await tapAt(svg, [370, 60]); // the top of the scaffold, away from its marker
      expect(plain(pci.getResponse())).toMatchObject({ found: 0, h1: false, marks: "sign" });
      expect(byTestId(mounted, "live")).toHaveTextContent("Mark removed: the top of the scaffold.");
    });

    await step("every hazard and nothing else: correct; the marks the same whatever the order", async () => {
      await tapAt(svg, at("sign"));
      for (const id of ["hole", "helmet", "ladder", "wheels", "materials", "railing"]) await tapAt(svg, at(id));
      expect(plain(pci.getResponse())).toEqual({
        found: 6, total: 6, wrong: 0, correct: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
        marks: "railing; materials; ladder; wheels; hole; helmet",
      });
    });

    await step("every mark removed: nothing reported again", async () => {
      while (markers(mounted).length) await userEvent.click(canvas.getAllByRole("button", { name: /^Remove mark 1/ })[0]);
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

/** A finger: a tap may move a little, a swipe scrolls, two fingers pinch, and a tap just next to a spot is on it. */
export const TouchTap: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    const svg = sceneOf(mounted);
    expect(getComputedStyle(svg).touchAction).toBe("manipulation"); // the page still scrolls under a finger

    await step("a finger that moves 7 px still taps", async () => {
      await tapAt(svg, at("ladder"), { pointerType: "touch", move: 7 });
      expect(plain(pci.getResponse())).toMatchObject({ found: 1, h4: true, marks: "ladder" });
    });

    await step("a swipe of 25 px does nothing", async () => {
      await tapAt(svg, at("helmet"), { pointerType: "touch", move: 25 });
      expect(plain(pci.getResponse())).toMatchObject({ found: 1, marks: "ladder" });
    });

    await step("two fingers are a pinch, never a tap", async () => {
      const [a, b] = [screenPoint(svg, at("hole")), screenPoint(svg, at("wheels"))];
      const init = { pointerType: "touch", button: 0, bubbles: true, cancelable: true, composed: true };
      svg.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 11, clientX: a.x, clientY: a.y }));
      svg.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 12, clientX: b.x, clientY: b.y }));
      svg.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 11, clientX: a.x, clientY: a.y }));
      svg.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 12, clientX: b.x, clientY: b.y }));
      await afterPaint();
      expect(markers(mounted)).toHaveLength(1);
    });

    await step("a cancelled touch (the browser took it for a scroll) does nothing", async () => {
      const p = screenPoint(svg, at("hole"));
      const init = { pointerId: 5, pointerType: "touch", bubbles: true, composed: true, clientX: p.x, clientY: p.y };
      svg.dispatchEvent(new PointerEvent("pointerdown", init));
      svg.dispatchEvent(new PointerEvent("pointercancel", init));
      svg.dispatchEvent(new PointerEvent("pointerup", init));
      await afterPaint();
      expect(markers(mounted)).toHaveLength(1);
    });

    await step("a finger just next to a spot is on it; a mouse there is not", async () => {
      await tapAt(svg, [141, 100], { pointerType: "touch" }); // 4 units left of the top of the scaffold
      expect(plain(pci.getResponse())).toMatchObject({ found: 2, h1: true, wrong: 0 });
      await tapAt(svg, [141, 100], { pointerType: "touch" }); // on its marker? no: on the marked spot, so it goes
      expect(plain(pci.getResponse())).toMatchObject({ found: 1, h1: false });
      await tapAt(svg, [138, 60], { pointerType: "mouse" });
      expect(plain(pci.getResponse())).toMatchObject({ found: 1, wrong: 1, marks: "ladder; 138,60" });
    });

    await step("the marker of a finger is easy to hit again", async () => {
      await tapAt(svg, [146, 64], { pointerType: "touch" }); // 10 units from the marker at 138,60
      expect(plain(pci.getResponse())).toMatchObject({ wrong: 0, marks: "ladder" });
    });
  },
};

/** Tab to the picture; the arrow keys go from spot to spot, Space marks, Delete removes. */
export const Keyboard: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci, root } = mounted;
    const svg = sceneOf(mounted);
    svg.focus();
    expect(focusedIn(root)).toBe(svg);

    await step("Home: the first spot, read without saying whether it is a hazard", async () => {
      await press(svg, "Home");
      expect(byTestId(mounted, "cursor-text")).toHaveTextContent("Spot 1 of 9: the top of the scaffold. Not marked.");
      expect(byTestId(mounted, "live")).toHaveTextContent("Spot 1 of 9: the top of the scaffold. Not marked.");
      expect(byTestId(mounted, "cursor")).toHaveAttribute("data-spot", "railing");
    });

    await step("Space marks the spot, where its marker goes", async () => {
      await press(svg, " ");
      expect(plain(pci.getResponse())).toMatchObject({ found: 1, h1: true, marks: "railing" });
      expect(byTestId(mounted, "live")).toHaveTextContent("Mark 1 placed: the top of the scaffold.");
      expect(byTestId(mounted, "cursor-text")).toHaveTextContent("Spot 1 of 9: the top of the scaffold. Marked, mark 1.");
    });

    await step("in reading order: the bricks, the sign, the ladder; Enter marks too", async () => {
      await press(svg, "ArrowRight");
      expect(byTestId(mounted, "cursor-text")).toHaveTextContent("Spot 2 of 9: the bricks on the scaffold.");
      await press(svg, "ArrowDown", 2);
      expect(byTestId(mounted, "cursor-text")).toHaveTextContent("Spot 4 of 9: the ladder. Not marked.");
      await press(svg, "Enter");
      expect(plain(pci.getResponse())).toMatchObject({ found: 2, h4: true, marks: "railing; ladder" });
    });

    await step("the ends wrap around", async () => {
      await press(svg, "Home");
      await press(svg, "ArrowLeft");
      expect(byTestId(mounted, "cursor-text")).toHaveTextContent("Spot 9 of 9: the stack of bricks on the ground.");
      await press(svg, "End");
      await press(svg, "ArrowRight");
      expect(byTestId(mounted, "cursor-text")).toHaveTextContent("Spot 1 of 9");
    });

    await step("Delete removes the mark of the spot", async () => {
      await press(svg, "Delete");
      expect(plain(pci.getResponse())).toMatchObject({ found: 1, marks: "ladder" });
      expect(byTestId(mounted, "live")).toHaveTextContent("Mark removed: the top of the scaffold.");
    });

    await step("Remove in the list: the focus goes back to the picture when no mark is left", async () => {
      const remove = canvas.getByRole("button", { name: "Remove mark 1: the ladder" });
      remove.focus();
      await userEvent.click(remove);
      await waitFor(() => expect(focusedIn(root)).toBe(svg));
      expect(pci.getResponse()).toBeUndefined();
    });
  },
};

/** Remove in the list of marks: the focus goes on to the next Remove button. */
export const RemoveFromTheList: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root, pci } = mounted;
    const svg = sceneOf(mounted);
    for (const id of ["helmet", "hole", "sign"]) await tapAt(svg, at(id));
    const buttons = () => canvas.getAllByRole("button", { name: /^Remove mark/ });
    expect(buttons().map((b) => b.getAttribute("aria-label"))).toEqual([
      "Remove mark 1: the person by the wall", "Remove mark 2: the hole in the ground", "Remove mark 3: the sign",
    ]);
    for (const button of buttons()) expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
    await userEvent.click(buttons()[1]);
    await waitFor(() => expect(focusedIn(root)).toBe(buttons()[1]));
    expect(focusedIn(root)).toHaveAccessibleName("Remove mark 2: the sign");
    expect(plain(pci.getResponse())).toMatchObject({ marks: "sign; helmet" });
  },
};

/** A narrow item (a phone): the picture scales down, its markers stay big enough to tap. */
export const Narrow: Story = {
  args: { width: 360 },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const svg = sceneOf(mounted);
    expect(svg.getBoundingClientRect().width).toBeLessThan(370);
    await tapAt(svg, at("hole"), { pointerType: "touch" });
    await waitFor(() => expect(markers(mounted)[0].querySelector("circle")!.getBoundingClientRect().width).toBeGreaterThanOrEqual(24));
    // a finger next to the marker removes it
    await tapAt(svg, [at("hole")[0] + 28, at("hole")[1] - 12], { pointerType: "touch" });
    expect(markers(mounted)).toHaveLength(0);
    expect(mounted.pci.getResponse()).toBeUndefined();
  },
};

/** "Find 2": the pupil is told how many, and cannot place more marks than that. */
export const Limit: Story = {
  args: { properties: { maxMarks: "2" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, pci } = mounted;
    const svg = sceneOf(mounted);
    expect(canvas.getByText("Look carefully at the picture. Find 2 unsafe situations, and tap them.")).toBeInTheDocument();
    await tapAt(svg, at("ladder"));
    await tapAt(svg, at("hole"));
    expect(byTestId(mounted, "count")).toHaveTextContent("2 of 2 marks");
    await tapAt(svg, at("helmet"));
    expect(byTestId(mounted, "notice")).toHaveTextContent("You have used all 2 marks. Remove a mark first.");
    expect(plain(pci.getResponse())).toMatchObject({ found: 2, marks: "ladder; hole" });
    // the keyboard is held to it too; removing still works
    await press(svg, "End");
    await press(svg, " ");
    expect(markers(mounted)).toHaveLength(2);
    await tapAt(svg, at("hole"));
    await tapAt(svg, at("helmet"));
    expect(plain(pci.getResponse())).toMatchObject({ found: 2, marks: "ladder; helmet" });
    expect(byTestId(mounted, "notice")).toBeNull();
  },
};

/** Without the penalty a mark on a safe spot costs nothing: every hazard found is correct. */
export const NoPenalty: Story = {
  args: { properties: { penalty: "false", hazards: "ladder, hole" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(mounted.canvas.queryByText("Careful: a mark on a safe spot costs a point.")).toBeNull();
    const svg = sceneOf(mounted);
    for (const id of ["ladder", "hole", "sign"]) await tapAt(svg, at(id));
    expect(plain(mounted.pci.getResponse())).toEqual({ found: 2, total: 2, wrong: 1, correct: true, h1: true, h2: true, marks: "sign; ladder; hole" });
  },
};

/** The author counts some hazards: the others are drawn safe, and are look-alikes then. */
export const SomeHazards: Story = {
  args: { properties: { hazards: "ladder, helmet" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const svg = sceneOf(mounted);
    await tapAt(svg, at("railing")); // the scaffold has its railing now
    await tapAt(svg, at("helmet"));
    expect(plain(mounted.pci.getResponse())).toEqual({ found: 1, total: 2, wrong: 1, correct: false, h1: false, h2: true, marks: "railing; helmet" });
  },
};

/** An area the author drew counts as a hazard, after the scene's own. */
export const ExtraArea: Story = {
  args: {
    properties: {
      hazards: "hole",
      extraHazards: JSON.stringify([{ name: "Bricks too close to the hole", label: "the earth by the hole", why: "They can fall in.", x: 410, y: 430, w: 70, h: 50 }]),
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const svg = sceneOf(mounted);
    await tapAt(svg, [445, 460]);
    expect(plain(mounted.pci.getResponse())).toEqual({ found: 1, total: 2, wrong: 0, correct: false, h1: false, h2: true, marks: "extra1" });
    expect(mounted.canvas.getByRole("button", { name: "Remove mark 1: the earth by the hole" })).toBeInTheDocument();
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl", maxMarks: "6" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas } = mounted;
    expect(canvas.getByText("Kijk goed naar de plaat. Zoek 6 onveilige situaties en tik ze aan.")).toBeInTheDocument();
    expect(canvas.getByRole("application", { name: "Plaat: Bouwplaats met een rolsteiger" })).toBeInTheDocument();
    expect(sceneOf(mounted).textContent).toContain("HELM OP");
    await tapAt(sceneOf(mounted), at("wheels"));
    expect(canvas.getByRole("button", { name: "Markering 1 weghalen: de wielen van de steiger" })).toHaveTextContent("Weghalen");
    expect(byTestId(mounted, "count")).toHaveTextContent("1 van 6 markeringen");
  },
};

export const RestoreState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    const svg = sceneOf(first);
    await tapAt(svg, [702, 148]);
    await tapAt(svg, at("ladder"));
    const state = first.pci.getState();
    const response = first.pci.getResponse();
    // the pupil comes back: the marks where they tapped, in the same order
    const second = await remountPci(canvasElement, pci, { state });
    expect(second.pci.getResponse()).toEqual(response);
    expect(markers(second).map((m) => [m.textContent, m.getAttribute("data-on")])).toEqual([["1", ""], ["2", "ladder"]]);
  },
};

/** A state of another scene (the author changed the item) or not of this PCI: start without marks. */
export const ForeignState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    await tapAt(sceneOf(first), at("ladder"));
    const state = first.pci.getState();
    const other = await remountPci(canvasElement, pci, { state, properties: { scene: "kitchen" } });
    expect(other.pci.getResponse()).toBeUndefined();
    const foreign = await remountPci(canvasElement, pci, { state: "not a state of this PCI" });
    expect(foreign.pci.getResponse()).toBeUndefined();
  },
};

export const BoundResponse: Story = {
  args: { boundTo: { RESPONSE: recordWith("ladder; hole; 20,30") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ found: 2, wrong: 1, h4: true, h6: true, marks: "ladder; hole; 20,30" });
    expect(markers(mounted)).toHaveLength(3);
  },
};

/** After answering: what was found, what was not, the marks on a safe spot, and why each hazard is unsafe. */
export const Review: Story = {
  args: { status: "review", boundTo: { RESPONSE: recordWith("railing; sign; ladder; wheels; helmet; 700,150") } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    expect(byTestId(mounted, "summary")).toHaveTextContent("You found 4 of the 6 hazards. 2 marks are on a safe spot.");
    expect(sceneOf(mounted).tabIndex).toBe(-1); // not in the Tab order
    expect(canvas.getByRole("img", { name: "Picture: Building site with a mobile scaffold" })).toBeInTheDocument();
    const items = Array.from(root.querySelectorAll('[data-testid="hazard-item"]'));
    expect(items.map((item) => item.getAttribute("data-found"))).toEqual(["true", "false", "true", "true", "true", "false"]);
    expect(items[1]).toHaveTextContent("Materials on the edge");
    expect(items[1]).toHaveTextContent("not found");
    expect(items[1]).toHaveTextContent("The bricks can fall on someone's head.");
    const wrong = Array.from(root.querySelectorAll('[data-testid="wrong-item"]')).map((item) => item.textContent);
    expect(wrong).toEqual([
      "The signThis is safe. The sign tells everyone to wear a helmet.",
      "A spot at the top rightThere is no hazard here.",
    ]);
    // in the picture: a check mark or a cross on every mark, every hazard outlined and numbered
    expect(markers(mounted).map((m) => m.getAttribute("data-kind"))).toEqual(["found", "wrong", "found", "found", "found", "wrong"]);
    expect(root.querySelectorAll('[data-testid="hazard"][data-found="false"]')).toHaveLength(2);
    expect(canvas.queryByRole("button", { name: /Remove/ })).toBeNull();
    // read-only
    await tapAt(sceneOf(mounted), at("hole"));
    expect(markers(mounted)).toHaveLength(6);
  },
};

/** The correct response of the item, read-only, with every hazard explained. */
export const Solution: Story = {
  args: {
    status: "solution",
    properties: { hazards: "railing, wheels, hole" },
    responseDeclaration: { correctResponse: { value: pci.getCorrectResponse!({ hazards: "railing, wheels, hole" } as never) } },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(byTestId(mounted, "summary")).toHaveTextContent("The 3 hazards in the picture:");
    expect(markers(mounted).map((m) => m.getAttribute("data-on"))).toEqual(["railing", "wheels", "hole"]);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, found: 3, total: 3 });
  },
};

/** Without a correct response with marks in the item, the PCI shows its own. */
export const SolutionOfItsOwn: Story = {
  args: { status: "solution", properties: { scene: "kitchen", language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(byTestId(mounted, "summary")).toHaveTextContent("De 6 gevaren op de plaat:");
    expect(plain(mounted.pci.getResponse())).toMatchObject({ correct: true, found: 6, total: 6 });
  },
};

/** The correct response from the settings: every hazard that counts, and nothing else. */
export const CorrectResponse: Story = {
  play: async () => {
    const correct = (properties: Record<string, string>) => plain(pci.getCorrectResponse!(properties as never));
    expect(correct({})).toEqual({
      found: 6, total: 6, wrong: 0, correct: true, h1: true, h2: true, h3: true, h4: true, h5: true, h6: true,
      marks: "railing; materials; ladder; wheels; hole; helmet",
    });
    expect(correct({ scene: "warehouse", hazards: "spill, exit" })).toEqual({ found: 2, total: 2, wrong: 0, correct: true, h1: true, h2: true, marks: "exit; spill" });
    expect(pci.getCorrectResponse!({ hazards: "none" } as never)).toBeUndefined();
  },
};

/** The correct response from the settings, set as the response, gives the same response back. */
export const CorrectResponseRoundTrip: Story = {
  args: { properties: { scene: "workshop", hazards: "cables, goggles" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const correct = pci.getCorrectResponse!({ scene: "workshop", hazards: "cables, goggles" } as never)!;
    mounted.pci.setResponse(correct);
    await waitFor(() => expect(markers(mounted)).toHaveLength(2));
    expect(mounted.pci.getResponse()).toEqual(correct);
  },
};

export const Validity: Story = {
  play: async ({ canvasElement }) => {
    const { pci } = await openPci(canvasElement);
    expect(pci.checkValidity()).toBe(true);
    pci.setCustomValidity("Zet minstens één markering.");
    expect(pci.getCustomValidity()).toBe("Zet minstens één markering.");
    expect(pci.checkValidity()).toBe(false);
    pci.setCustomValidity("");
    expect(pci.checkValidity()).toBe(true);
  },
};

/** Two scenes on one page: each keeps its own marks and response. */
export const TwoInstances: Story = {
  render: () => {
    const page = document.createElement("div");
    for (const [id, scene] of [["first", "scaffold"], ["second", "warehouse"]]) {
      const slot = document.createElement("div");
      slot.dataset.slot = id;
      slot.appendChild(mountPci(pci, { width: 600, properties: { scene } }));
      page.appendChild(slot);
    }
    return page;
  },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=first]")!);
    const second = await openPci(canvasElement.querySelector<HTMLElement>("[data-slot=second]")!);
    expect(first.pci).not.toBe(second.pci);
    await tapAt(sceneOf(first), at("ladder"));
    await tapAt(sceneOf(second), at("exit", SCENES.warehouse.spots));
    expect(plain(first.pci.getResponse())).toMatchObject({ marks: "ladder", total: 6 });
    expect(plain(second.pci.getResponse())).toMatchObject({ marks: "exit", total: 5 });
    expect(first.changes).toHaveLength(1);
    expect(second.changes).toHaveLength(1);
  },
};

// ---- the scenes ----

/** Every spot of a scene: tapped where its marker goes, it is that spot (the keyboard reaches all of them). */
const everySpot = (scene: keyof typeof SCENES, hazards = "all"): Story => ({
  args: { properties: { scene, hazards } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const svg = sceneOf(mounted);
    const spots = SCENES[scene].spots;
    for (const spot of spots) await tapAt(svg, spot.at);
    const counted = hazards === "none" ? 0 : spots.filter((s) => s.hazard).length;
    expect(plain(mounted.pci.getResponse())).toMatchObject({ found: counted, total: counted, wrong: spots.length - counted, correct: false });
    expect(markers(mounted).map((m) => m.getAttribute("data-on"))).toEqual(spots.map((s) => s.id));
    await press(svg, "End");
    expect(byTestId(mounted, "cursor-text")).toHaveTextContent(`Spot ${spots.length} of ${spots.length}`);
  },
});

export const Warehouse: Story = everySpot("warehouse");
export const Kitchen: Story = everySpot("kitchen");
export const Workshop: Story = everySpot("workshop");
export const ScaffoldDrawnSafe: Story = { ...everySpot("scaffold", "none"), name: "Building site, every hazard drawn safe" };
export const WarehouseDrawnSafe: Story = { ...everySpot("warehouse", "none"), name: "Warehouse, every hazard drawn safe" };
export const KitchenDrawnSafe: Story = { ...everySpot("kitchen", "none"), name: "Kitchen, every hazard drawn safe" };
export const WorkshopDrawnSafe: Story = { ...everySpot("workshop", "none"), name: "Workshop, every hazard drawn safe" };

/** The warehouse, a few marks placed (example.png). */
export const Example: Story = {
  args: { width: 760, properties: { scene: "warehouse", title: "Safe in the warehouse?" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const svg = sceneOf(mounted);
    await tapAt(svg, [392, 352]); // beside the person under the forks
    await tapAt(svg, [736, 360]);
    await tapAt(svg, [600, 452]);
    expect(plain(mounted.pci.getResponse())).toMatchObject({ found: 3, wrong: 0 });
  },
};

// ---- the authoring mode ----

type Authoring = StoryObj<AuthoringArgs>;
const authorScene = (root: ShadowRoot | HTMLElement) => root.querySelector<SVGSVGElement>('[data-testid="author-scene"]')!;
const counts = (root: ShadowRoot | HTMLElement) =>
  Object.fromEntries(Array.from(root.querySelectorAll('[data-testid="author-spot"]')).map((g) => [g.getAttribute("data-spot"), g.getAttribute("data-counts") === "true"]));

export const AuthoringHazards: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en" },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, root, changes } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;

    await step("the building site, every hazard counts, numbered as in the response", async () => {
      expect(canvas.getByRole("heading", { name: "Choose the scene and the hazards" })).toBeInTheDocument();
      expect(canvas.getByRole("radio", { name: "Building site with a mobile scaffold" })).toHaveAttribute("aria-checked", "true");
      expect(canvas.getAllByRole("checkbox").map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, true, true, true, true]);
      expect(properties()).toEqual({ scene: "scaffold", hazards: "all", extraHazards: "" });
      expect(canvas.getByText("6 hazards count (at most 8).")).toBeInTheDocument();
      expect(instance.validate()).toEqual([]);
    });

    await step("a hazard left out: drawn safe, not numbered", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /^No helmet/ }));
      expect(properties().hazards).toBe("railing, materials, wheels, ladder, hole");
      expect(counts(root)).toMatchObject({ helmet: false, ladder: true, sign: false });
      expect(changes.length).toBeGreaterThan(0);
    });

    await step("a tap on a hazard in the picture ticks it again", async () => {
      await tapAt(authorScene(root), at("helmet"), { pointerType: "touch" });
      expect(properties().hazards).toBe("all");
    });

    await step("nothing counts: Done waits", async () => {
      for (const box of canvas.getAllByRole("checkbox")) await userEvent.click(box);
      expect(properties().hazards).toBe("none");
      expect(instance.validate()).toEqual(["Choose at least one hazard, or draw an area."]);
    });

    await step("another scene: all of its hazards", async () => {
      await userEvent.click(canvas.getByRole("radio", { name: "Kitchen" }));
      expect(properties()).toEqual({ scene: "kitchen", hazards: "all", extraHazards: "" });
      expect(canvas.getAllByRole("checkbox")).toHaveLength(6);
    });
  },
};

export const AuthoringArea: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "en", properties: { scene: "workshop", hazards: "cables, gasBottle", maxMarks: "3" } },
  play: async ({ canvasElement, step }) => {
    const { instance, canvas, root } = await openAuthoring(canvasElement);
    const properties = () => instance.getProperties() as Record<string, string>;
    const areas = () => JSON.parse(properties().extraHazards || "[]");
    expect(canvas.getByText("Note: the pupil may place 3 marks, and 2 hazards count.")).toBeInTheDocument();

    await step("an area added: drawn with a drag on the picture", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "+ Add an area" }));
      expect(canvas.getByRole("status")).toHaveTextContent("Drag on the picture to draw area 1.");
      expect(authorScene(root).style.touchAction).toBe("none"); // only while drawing
      const svg = authorScene(root);
      const [from, to] = [screenPoint(svg, [100, 330]), screenPoint(svg, [200, 400])];
      const init = { pointerId: 3, pointerType: "touch", button: 0, bubbles: true, composed: true };
      svg.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: from.x, clientY: from.y }));
      svg.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2 }));
      svg.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: to.x, clientY: to.y }));
      svg.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: to.x, clientY: to.y }));
      await afterPaint();
      expect(areas()).toEqual([{ name: "", label: "", why: "", x: 100, y: 330, w: 100, h: 70 }]);
      expect(canvas.queryByRole("status")).toBeNull();
      expect(authorScene(root).style.touchAction).toBe("");
      expect(canvas.getByText("The pupil may place 3 marks: as many as there are hazards.")).toBeInTheDocument();
    });

    await step("it needs a name; a description and an explanation, and where it is, typed", async () => {
      expect(instance.validate()).toEqual(["Give every area a name."]);
      await userEvent.type(canvas.getByRole("textbox", { name: "Name (shown after answering)" }), "Oil on the floor");
      await userEvent.type(canvas.getByRole("textbox", { name: /^Description read to the pupil/ }), "the floor by the bench");
      await userEvent.type(canvas.getByRole("textbox", { name: /^Why is it unsafe/ }), "Someone can slip.");
      await retype(canvas.getByRole("spinbutton", { name: "Width" }), "120");
      expect(instance.validate()).toEqual([]);
      expect(areas()).toEqual([{ name: "Oil on the floor", label: "the floor by the bench", why: "Someone can slip.", x: 100, y: 330, w: 120, h: 70 }]);
      expect(counts(root)).toMatchObject({ extra1: true, cables: true, drill: false });
    });

    await step("removed: the focus goes to Add an area", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove area 1" }));
      expect(properties().extraHazards).toBe("");
      await waitFor(() => expect(focusedIn(root)).toBe(canvas.getByRole("button", { name: "+ Add an area" })));
    });
  },
};

/** An area of the author's own, as it opens: outlined and numbered after the scene's hazards. */
export const AuthoringWithArea: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: {
    language: "en",
    properties: {
      scene: "kitchen",
      hazards: "knife, panHandle, oven, wetFloor",
      extraHazards: JSON.stringify([{ name: "Hot water tap", label: "the tap", why: "The water is very hot: let it run cold first.", x: 96, y: 176, w: 56, h: 40 }]),
    },
  },
  play: async ({ canvasElement }) => {
    const { instance, canvas, root } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("textbox", { name: "Name (shown after answering)" })).toHaveValue("Hot water tap");
    expect(canvas.getByRole("group", { name: "Area 1 (h5)" })).toBeInTheDocument();
    expect(counts(root)).toMatchObject({ knife: true, cable: false, extra1: true });
    expect(canvas.getByText("5 hazards count (at most 8).")).toBeInTheDocument();
    expect(instance.validate()).toEqual([]);
    // with 8 hazards, no more areas
    for (const name of [/^Cable over the sink/, /^Cleaning agent/]) await userEvent.click(canvas.getByRole("checkbox", { name }));
    await userEvent.click(canvas.getByRole("button", { name: "+ Add an area" }));
    await userEvent.type(canvas.getAllByRole("textbox", { name: "Name (shown after answering)" })[1], "Bin");
    expect(canvas.getByRole("button", { name: "+ Add an area" })).toBeDisabled();
    expect(canvas.getByText("8 hazards count (at most 8).")).toBeInTheDocument();
    expect(instance.validate()).toEqual([]);
  },
};

/** More than 8 hazards (typed in a text field): Done waits until one is left out. */
export const AuthoringTooMany: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: {
    language: "en",
    properties: { scene: "kitchen", extraHazards: JSON.stringify(["A", "B", "C"].map((name, i) => ({ name, label: "", why: "", x: 20 + 100 * i, y: 400, w: 60, h: 40 }))) },
  },
  play: async ({ canvasElement }) => {
    const { instance, canvas } = await openAuthoring(canvasElement);
    expect(instance.validate()).toEqual(["At most 8 hazards can count, now 9: leave one out."]);
    await userEvent.click(canvas.getByRole("checkbox", { name: /^Oven door open/ }));
    expect(instance.validate()).toEqual([]);
  },
};

export const AuthoringDutch: Authoring = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { scene: "warehouse", hazards: "spill, exit, nonsense" } },
  play: async ({ canvasElement }) => {
    const { canvas, instance } = await openAuthoring(canvasElement);
    expect(canvas.getByRole("heading", { name: "Plaat en gevaren kiezen" })).toBeInTheDocument();
    expect(canvas.getByRole("radio", { name: "Magazijn met een heftruck" })).toHaveAttribute("aria-checked", "true");
    expect(canvas.getByRole("checkbox", { name: /^Gemorste vloeistof/ })).toBeChecked();
    expect(canvas.getByRole("checkbox", { name: /^Kapotte pallet/ })).not.toBeChecked();
    expect(instance.getProperties()).toEqual({ scene: "warehouse", hazards: "exit, spill", extraHazards: "" });
    expect(canvas.getByText("2 gevaren tellen mee (hoogstens 8).")).toBeInTheDocument();
  },
};
