// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/svgmap, © OpenPCI (Aarhus University and Aalborg University):
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard.
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026.

// The example map, shown while data-backdrop is empty. Like any map for this PCI it is an SVG with a layer
// (id "path") of paths the candidate can follow. Every road between two crossings is a path of its own: paths are
// joined where their ends meet, never in the middle.

type P = [number, number];
const J: Record<string, P> = {
  A: [40, 60], B: [180, 60], C: [320, 60], D: [440, 60],
  E: [40, 160], F: [180, 160], G: [320, 160], H: [440, 160],
  I: [40, 270], J: [180, 270], K: [320, 270], L: [440, 270],
};
const straight = (a: string, b: string) => `M ${J[a].join(" ")} L ${J[b].join(" ")}`;
const roads = [
  straight("A", "B"), straight("B", "C"), straight("C", "D"),
  straight("A", "E"), straight("B", "F"), straight("D", "H"),
  straight("E", "F"), straight("F", "G"), straight("G", "H"),
  straight("E", "I"), straight("G", "K"), straight("H", "L"),
  straight("I", "J"), straight("J", "K"), straight("K", "L"),
  // a winding lane through the park, and a bridge road
  `M ${J.C.join(" ")} C 300 100 340 120 ${J.G.join(" ")}`,
  `M ${J.F.join(" ")} C 200 210 160 230 ${J.J.join(" ")}`,
];

const blocks: [number, number, number, number][] = [
  [52, 72, 116, 76], [52, 172, 116, 86], [332, 72, 96, 76], [332, 172, 96, 86], [192, 172, 116, 86],
];
const buildings = blocks
  .map(([x, y, w, h]) =>
    `<rect x="${x + 6}" y="${y + 6}" width="${w / 2 - 9}" height="${h / 2 - 9}" rx="3"/>` +
    `<rect x="${x + w / 2 + 3}" y="${y + 6}" width="${w / 2 - 9}" height="${h / 2 - 9}" rx="3"/>` +
    `<rect x="${x + 6}" y="${y + h / 2 + 3}" width="${w - 12}" height="${h / 2 - 9}" rx="3"/>`)
  .join("");

const label = (x: number, y: number, text: string) =>
  `<text x="${x}" y="${y}" text-anchor="middle">${text}</text>`;

export const EXAMPLE_MAP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="480" height="320">
  <rect width="480" height="320" fill="#f4f1ea"/>
  <path d="M0 214 C 90 200 120 240 240 222 S 400 190 480 206 L 480 226 C 400 212 330 250 240 244 S 90 222 0 236 Z" fill="#bfdbfe"/>
  <rect x="192" y="72" width="116" height="76" rx="8" fill="#bbf7d0"/>
  <ellipse cx="236" cy="112" rx="22" ry="14" fill="#93c5fd"/>
  <g fill="#e2ddd2">${buildings}</g>
  <g fill="none" stroke="#cbd5e1" stroke-width="12" stroke-linecap="round">${roads.map((d) => `<path d="${d}"/>`).join("")}</g>
  <g id="path" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round">${roads.map((d, i) => `<path id="road${i + 1}" d="${d}"/>`).join("")}</g>
  <g font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#334155" stroke="#f4f1ea" stroke-width="3" paint-order="stroke">
    ${label(40, 292, "Home")}${label(250, 48, "School")}${label(250, 140, "Park")}${label(404, 114, "Library")}${label(380, 292, "Station")}
  </g>
</svg>`;

/** The points of interest of the example map, as positions: they become the nearest point of the map. */
export const EXAMPLE_POI: Record<string, P> = {
  start: J.I,
  school: [250, 60],
  library: [440, 110],
  station: [380, 270],
  park: [250, 160],
};
