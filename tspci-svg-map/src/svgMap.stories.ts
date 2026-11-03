import type { Meta, StoryObj } from "@storybook/html-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { lastChange, mountAuthoring, mountPci, openAuthoring, openPci, remountPci, type AuthoringArgs, type MountedPci, type PciArgs } from "../../.storybook/tspci";
import pci from "./index";

const meta = {
  title: "SVG map",
  render: (args) => mountPci(pci, args),
} satisfies Meta<PciArgs>;
export default meta;
type Story = StoryObj<PciArgs>;

// The example map (example-map.ts) is numbered as the original numbers it: a point every 5 units along each road, in
// the order of the roads. Its start is crossing I (point 298), school 43, library 135, park 189, station 368.
const range = (from: number, to: number) => {
  const step = from <= to ? 1 : -1;
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + i * step);
};
/** From the start (I) up to crossing E (229): the road E–I backwards. */
const TO_E = [298, ...range(250, 229)];

const mapOf = (root: MountedPci["root"]) => root.querySelector<SVGSVGElement>('[data-testid="map"]')!;

/** Clicks (pointer down and up) the map at a point in map coordinates. */
const clickAt = (svg: SVGSVGElement, x: number, y: number) => {
  const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
  const init = { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: "mouse", button: 0, bubbles: true, cancelable: true, composed: true };
  svg.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
  svg.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
};

const response = (m: MountedPci) => {
  const r = m.pci.getResponse();
  return r === undefined ? undefined : JSON.parse(r.base.string);
};

const statusOf = (root: MountedPci["root"]) => root.querySelector('[data-testid="status"]')!.textContent;
const liveOf = (root: MountedPci["root"]) => root.querySelector('[data-testid="live"]')!.textContent;

export const Default: Story = {
  play: async ({ canvasElement, step }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    const map = mapOf(root);

    await step("the map with the start and the points of interest; no route and no response", async () => {
      expect(canvas.getByRole("application", { name: "Draw a route from home to the station that passes the school and the library." })).toBe(map);
      expect(root.querySelector('[data-testid="start"]')).not.toBeNull();
      expect([...root.querySelectorAll("[data-testid^=poi-]")].map((g) => g.getAttribute("data-testid"))).toEqual(
        ["poi-school", "poi-library", "poi-station", "poi-park"]
      );
      expect(root.querySelector('[data-testid="route"]')).toBeNull();
      expect(statusOf(root)).toBe("No route yet.");
      expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
      expect(canvas.getByRole("button", { name: "Start over" })).toBeDisabled();
      expect(mounted.pci.getResponse()).toBeUndefined();
    });

    await step("a click on a crossing draws the route there along the road", async () => {
      clickAt(map, 40, 160); // crossing E
      expect(await lastChange(mounted)).toEqual({ base: { string: JSON.stringify({ path: TO_E, poi: [] }) } });
      expect(response(mounted)).toEqual({ path: TO_E, poi: [] });
      await waitFor(() => expect(root.querySelector('[data-testid="route"]')).not.toBeNull());
      expect(statusOf(root)).toBe("It passes no points of interest yet.");
      expect(liveOf(root)).toBe("Route drawn to Point 7. It passes no points of interest yet.");
    });

    await step("on to the station: the shortest way, without going back over the route", async () => {
      clickAt(map, 380, 270);
      await lastChange(mounted, 2);
      const { path, poi } = response(mounted);
      // back down to I would go back over the route: E–F, F–G past the park, G–K, K–L to the station
      expect(path.slice(0, TO_E.length)).toEqual(TO_E);
      expect(path[path.length - 1]).toBe(368);
      expect(path).toContain(189); // the park
      expect(path).toContain(356); // crossing K
      expect(path).not.toContain(299); // not along I–J
      expect(poi).toEqual(["station", "park"]);
      await waitFor(() => expect(root.querySelector('[data-testid="poi-station"]')).toHaveAttribute("data-passed", "true"));
      expect(statusOf(root)).toBe("It passes: station, park.");
    });

    await step("a click on a point of the route takes the route back to it", async () => {
      clickAt(map, 40, 160);
      await lastChange(mounted, 3);
      expect(response(mounted)).toEqual({ path: TO_E, poi: [] });
      expect(liveOf(root)).toBe("Route taken back to Point 7. It passes no points of interest yet.");
    });

    await step("undo goes back a step; start over back to the start alone: no response", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(response(mounted).poi).toEqual(["station", "park"]);
      await userEvent.click(canvas.getByRole("button", { name: "Start over" }));
      expect(mounted.pci.getResponse()).toBeUndefined();
      expect(await lastChange(mounted)).toBeUndefined();
      expect(statusOf(root)).toBe("No route yet.");
      expect(liveOf(root)).toBe("Route cleared.");
      // and undo brings the route back
      await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
      expect(response(mounted).poi).toEqual(["station", "park"]);
    });
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { root } = mounted;
    const map = mapOf(root);
    map.focus();
    await waitFor(() => expect(liveOf(root)).toBe("Start, end of your route. Roads lead right, up."));
    await userEvent.keyboard("{ArrowUp}");
    expect(liveOf(root)).toBe("Point 7. Roads lead down, up, right.");
    // nothing drawn yet: moving is not choosing
    expect(mounted.pci.getResponse()).toBeUndefined();
    await userEvent.keyboard("{Enter}");
    expect(response(mounted)).toEqual({ path: TO_E, poi: [] });
    expect(liveOf(root)).toBe("Route drawn to Point 7. It passes no points of interest yet.");
    await userEvent.keyboard("{Backspace}");
    expect(mounted.pci.getResponse()).toBeUndefined();
    expect(liveOf(root)).toBe("Last step undone.");
  },
};

export const Scoring: Story = {
  args: { properties: { requiredpoi: "station", endpoi: "library" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const map = mapOf(mounted.root);
    // along the bottom to the station: passes it, but does not end at the library
    clickAt(map, 380, 270);
    const toStation = [298, ...range(299, 325)];
    await lastChange(mounted);
    let r = response(mounted);
    expect(r.path.slice(0, toStation.length)).toEqual(toStation);
    expect(r.path.slice(-13)).toEqual([356, ...range(357, 368)]);
    expect(r.poi).toEqual(["station"]);
    expect(r.score).toBe(0);
    // on to the library: from the station to L (380), up to H (275), up to the library
    const before = r.path.length;
    clickAt(map, 440, 110);
    await lastChange(mounted, 2);
    r = response(mounted);
    expect(r.path).toHaveLength(before + 12 + 22 + 10);
    expect(r.path.slice(before)).toEqual([...range(369, 380), ...range(296, 275), ...range(144, 135)]);
    expect(r.poi).toEqual(["library", "station"]);
    expect(r.score).toBe(1);
  },
};

export const ShortestRoute: Story = {
  args: { properties: { endpoi: "station", shortest: "true" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const map = mapOf(mounted.root);
    // the direct way along the bottom is a shortest one
    clickAt(map, 380, 270);
    await lastChange(mounted);
    expect(response(mounted)).toMatchObject({ poi: ["station"], score: 1 });
    // a detour by E ends at the station too, but is longer
    await userEvent.click(mounted.canvas.getByRole("button", { name: "Start over" }));
    clickAt(map, 40, 160);
    await lastChange(mounted, 3);
    expect(response(mounted)).toEqual({ path: TO_E, poi: [], score: 0 });
    clickAt(map, 380, 270);
    await lastChange(mounted, 4);
    expect(response(mounted)).toMatchObject({ poi: ["station", "park"], score: 0 });
  },
};

const LINE_MAP =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script>' +
  '<g id="roads"><path d="M 10 50 L 90 50" onclick="alert(1)"/></g></svg>';

export const OwnMap: Story = {
  args: {
    properties: {
      backdrop: LINE_MAP, pathlayer: "roads", dotresolution: "10", poi: '{"start":0,"end":8,"middle":4}', showpoi: "labels",
      prompt: "Walk to the end.",
    },
  },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { root, canvas } = mounted;
    // the author's scripts and event handlers are removed
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("[onclick]")).toBeNull();
    // markers with their names
    expect([...root.querySelectorAll("[data-testid^=poi-] text")].map((t) => t.textContent)).toEqual(["end", "middle"]);
    expect(canvas.getByRole("application", { name: "Walk to the end." })).toBeInTheDocument();
    // 9 points, 10 units apart: 0 at x = 10 ... 8 at x = 90
    clickAt(mapOf(root), 90, 50);
    expect(await lastChange(mounted)).toEqual({ base: { string: '{"path":[0,1,2,3,4,5,6,7,8],"poi":["end","middle"]}' } });
    // the order of the points of interest is the order of data-poi
  },
};

export const HiddenPoints: Story = {
  args: { properties: { showpoi: "none", requiredpoi: "school" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { root } = mounted;
    expect(root.querySelectorAll("[data-testid^=poi-]")).toHaveLength(0);
    // the start is always shown
    expect(root.querySelector('[data-testid="start"]')).not.toBeNull();
    clickAt(mapOf(root), 380, 270);
    await lastChange(mounted);
    // the response still names them (for scoring); the candidate is not told
    expect(response(mounted)).toMatchObject({ poi: ["station"], score: 0 });
    expect(statusOf(root)).toBe("Your route is drawn.");
    expect(liveOf(root)).toBe("Route drawn to station. It passes no points of interest yet.");
  },
};

export const MapProblems: Story = {
  args: { properties: { backdrop: "<svg xmlns='http://www.w3.org/2000/svg'><g id='path'></g></svg>" } },
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    expect(first.canvas.getByRole("alert")).toHaveTextContent('The layer "path" has no paths to follow.');

    // the path layer setting names a layer of the author's own map
    const second = await remountPci(canvasElement, pci, { properties: { backdrop: LINE_MAP } });
    expect(second.canvas.getByRole("alert")).toHaveTextContent('The map has no layer with id "path".');

    const third = await remountPci(canvasElement, pci, { properties: { backdrop: "this is no svg" } });
    expect(third.canvas.getByRole("alert")).toHaveTextContent("The map is not a valid SVG image.");
    // a click on a broken map draws nothing
    clickAt(mapOf(third.root), 10, 10);
    expect(third.pci.getResponse()).toBeUndefined();
  },
};

export const Dutch: Story = {
  args: { properties: { language: "nl" } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { canvas, root } = mounted;
    expect(canvas.getByRole("button", { name: "Ongedaan maken" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Opnieuw beginnen" })).toBeDisabled();
    expect(statusOf(root)).toBe("Nog geen route.");
    clickAt(mapOf(root), 380, 270);
    await lastChange(mounted);
    expect(statusOf(root)).toBe("Hij komt langs: station.");
    expect(liveOf(root)).toBe("Route getekend naar station. Hij komt langs: station.");
  },
};

export const RestoresState: Story = {
  play: async ({ canvasElement }) => {
    const first = await openPci(canvasElement);
    clickAt(mapOf(first.root), 40, 160);
    await lastChange(first);
    const state = first.pci.getState();
    expect(JSON.parse(state).state).toEqual({ path: TO_E });

    const second = await remountPci(canvasElement, pci, { state });
    expect(response(second)).toEqual({ path: TO_E, poi: [] });
    expect(second.root.querySelector('[data-testid="route"]')).not.toBeNull();
    expect(second.changes).toHaveLength(0);

    // a route with a point that is not on the map is not restored
    const third = await remountPci(canvasElement, pci, { state: JSON.stringify({ state: { path: [298, 99999] } }) });
    expect(third.pci.getResponse()).toBeUndefined();
  },
};

const BOUND = JSON.stringify({ path: TO_E, poi: [] });

export const BoundAndSetResponse: Story = {
  args: { boundTo: { RESPONSE: { base: { string: BOUND } } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    const { pci } = mounted;
    expect(response(mounted)).toEqual({ path: TO_E, poi: [] });
    expect(mounted.changes).toHaveLength(0);
    // a path end that was joined into a crossing (251, the end of road E–I) means that crossing (298)
    pci.setResponse({ base: { string: JSON.stringify({ path: [251, 250, 249] }) } });
    expect(response(mounted)).toEqual({ path: [298, 250, 249], poi: [] });
    // not a route: back to the start
    pci.setResponse({ base: { string: "no json" } });
    expect(pci.getResponse()).toBeUndefined();
    pci.setResponse({ base: { string: BOUND } });
    pci.resetResponse();
    expect(pci.getResponse()).toBeUndefined();
    expect(await lastChange(mounted)).toBeUndefined();
  },
};

export const Solution: Story = {
  args: { status: "solution", responseDeclaration: { correctResponse: { value: BOUND } } },
  play: async ({ canvasElement }) => {
    const mounted = await openPci(canvasElement);
    expect(response(mounted)).toEqual({ path: TO_E, poi: [] });
    expect(mounted.root.querySelector('[data-testid="route"]')).not.toBeNull();
  },
};

// Authoring mode: an authoring system calls getAuthoringInstance instead of getInstance
export const Authoring: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { properties: { requiredpoi: "school, museum" } },
  play: async ({ canvasElement, step }) => {
    const { instance, root, canvas } = await openAuthoring(canvasElement);
    const list = () => [...root.querySelectorAll('[data-testid="poi-list"] li button:not([aria-label])')].map((b) => b.textContent);

    await step("the example map with its points of interest", async () => {
      await waitFor(() => expect(list()).toEqual(["Start", "school", "library", "station", "park"]));
      expect(root.querySelector('[data-testid="summary"]')!.textContent).toMatch(/^\d+ points, 12 crossings and road ends$/);
      expect(canvas.getByRole("button", { name: "Use the example map" })).toBeDisabled();
      expect(canvas.getByTestId("required-school")).toBeChecked();
      // museum is not a point of interest
      expect(instance.validate()).toEqual(["The scoring names museum, which is not a point of interest."]);
      expect(root.querySelector('[data-testid="problems"]')).toHaveTextContent("The scoring names museum");
    });

    await step("the end and the must pass points are the scoring settings", async () => {
      await userEvent.click(canvas.getByTestId("end-station"));
      await userEvent.click(canvas.getByTestId("required-library"));
      // a change prunes the names that are no point of interest (museum)
      expect(instance.getProperties()).toEqual({
        backdrop: "",
        poi: JSON.stringify({ start: 298, school: 43, library: 135, station: 368, park: 189 }),
        requiredpoi: "school,library",
        endpoi: "station",
      });
    });

    await step("a point of the map is selected and becomes a point of interest", async () => {
      const map = root.querySelector<SVGSVGElement>('svg[aria-label="Map"]')!;
      // the middle of road A–E (A is 40,60; E 40,160): point 93 of road 4 (83–103)
      clickAt(map, 40, 110);
      await waitFor(() => expect(canvas.getByText("Selected: point 93")).toBeInTheDocument());
      const name = canvas.getByTestId("poi-name");
      await userEvent.type(name, "start");
      expect(canvas.getByText('Use letters, digits, - and _ only, and not "start".')).toBeInTheDocument();
      expect(canvas.getByTestId("add-poi")).toBeDisabled();
      await userEvent.type(name, "{Backspace>5/}museum");
      await userEvent.click(canvas.getByTestId("add-poi"));
      await waitFor(() => expect(list()).toEqual(["Start", "school", "library", "station", "park", "museum"]));
      expect(instance.validate()).toEqual([]);
      expect(JSON.parse(instance.getProperties().poi)).toMatchObject({ museum: 93 });
    });

    await step("removing a point of interest takes it out of the scoring too", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove station" }));
      expect(instance.getProperties()).toMatchObject({ endpoi: "", requiredpoi: "school,library" });
      expect(JSON.parse(instance.getProperties().poi)).not.toHaveProperty("station");
    });
  },
};

export const AuthoringOwnMap: StoryObj<AuthoringArgs> = {
  render: (args) => mountAuthoring(pci, args),
  args: { language: "nl", properties: { backdrop: LINE_MAP, pathlayer: "roads", dotresolution: "10", poi: '{"start":0}' } },
  play: async ({ canvasElement }) => {
    const { instance, root, canvas } = await openAuthoring(canvasElement);
    await waitFor(() => expect(root.querySelector('[data-testid="summary"]')).toHaveTextContent("9 punten, 2 kruispunten en wegeinden"));
    expect(canvas.getByRole("button", { name: "Voorbeeldkaart gebruiken" })).toBeEnabled();
    clickAt(root.querySelector<SVGSVGElement>('svg[aria-label="Kaart"]')!, 90, 50);
    await waitFor(() => expect(canvas.getByText("Geselecteerd: punt 8")).toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "Maak dit de start" }));
    expect(instance.getProperties()).toEqual({ backdrop: LINE_MAP, poi: '{"start":8}', requiredpoi: "", endpoi: "" });
    // back to the example map: its own roads (the path layer setting is for the author's map) and points of interest
    await userEvent.click(canvas.getByRole("button", { name: "Voorbeeldkaart gebruiken" }));
    await waitFor(() => expect(instance.getProperties().backdrop).toBe(""));
    await waitFor(() => expect(root.querySelector('[data-testid="summary"]')!.textContent).toMatch(/^\d+ punten, 12 kruispunten en wegeinden$/));
    expect(Object.keys(JSON.parse(instance.getProperties().poi))).toEqual(["start", "school", "library", "station", "park"]);
    expect(instance.validate()).toEqual([]);
  },
};
