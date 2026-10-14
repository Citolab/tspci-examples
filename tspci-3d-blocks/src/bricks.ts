import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry";
import { mergeBufferGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";

/**
 * The look of the blocks: toy bricks with studs (Duplo-like, 2 x 2 studs on a cube) on a studded baseplate.
 * Only the look: placing and removing still works on plain boxes (see VoxelPainterClass), so the response
 * does not depend on any of this.
 */

/** The default palette: classic brick colours (config.json brickColors). */
export const DEFAULT_BRICK_COLORS = ["#c91a09", "#f2cd37", "#0055bf", "#237841", "#fe8a18", "#5aa5dc"];

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** The renderer outputs sRGB; colours are given in sRGB (as designers pick them) and lit in linear space. */
export const srgb = (color: THREE.ColorRepresentation) => new THREE.Color(color).convertSRGBToLinear();

/** RoundedBoxGeometry is already non-indexed, cylinders are not; merging needs them all the same. */
const nonIndexed = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

/** Glossy ABS-like plastic, one shared material per colour. */
export const plasticMaterial = (color: string) => {
  if (!materials.has(color)) {
    materials.set(color, new THREE.MeshStandardMaterial({ color: srgb(color), roughness: 0.32, metalness: 0 }));
  }
  return materials.get(color);
};

/**
 * "#c91a09, #f2cd37" → valid CSS colours (anything THREE.Color understands is kept: hex, rgb(), names).
 * Falls back to the default palette when nothing usable is left.
 */
export const parseColors = (value: string | undefined): string[] => {
  const colors = String(value ?? "")
    .split(/[,;\s]+/)
    .map((c) => c.trim())
    .filter((c) => c && CSS.supports?.("color", c) !== false);
  return colors.length ? colors : DEFAULT_BRICK_COLORS;
};

/**
 * The colour of the brick in a cell. "single": every brick the first colour. "mixed": a colour that follows from the
 * cell, so a restored build looks the same; one step along x, y or z moves 1, 2 or 3 places in the palette, so
 * neighbours differ whenever the palette has more than three colours.
 */
export const brickColor = (position: THREE.Vector3, cellSize: number, palette: string[], mode: string) => {
  if (mode === "single" || palette.length === 1) return palette[0];
  const [x, y, z] = [position.x, position.y, position.z].map((v) => Math.round(v / cellSize));
  const index = (((x + 2 * y + 3 * z) % palette.length) + palette.length) % palette.length;
  return palette[index];
};

/** A cube-sized brick centred on the origin: a rounded body and 2 x 2 studs on top. */
export function createBrickGeometry(cellSize: number): THREE.BufferGeometry {
  const gap = cellSize * 0.02; // a hairline between neighbouring bricks, so every brick reads as one
  const width = cellSize - gap * 2;
  const studHeight = cellSize * 0.12;
  const bodyHeight = cellSize - studHeight - gap;

  const body = new RoundedBoxGeometry(width, bodyHeight, width, 3, cellSize * 0.035);
  body.translate(0, -cellSize / 2 + gap + bodyHeight / 2, 0);

  const parts: THREE.BufferGeometry[] = [body];
  const studRadius = cellSize * 0.15;
  const offset = cellSize / 4;
  for (const dx of [-offset, offset]) {
    for (const dz of [-offset, offset]) {
      const stud = new THREE.CylinderGeometry(studRadius, studRadius, studHeight, 24);
      stud.translate(dx, -cellSize / 2 + gap + bodyHeight + studHeight / 2, dz);
      parts.push(stud);
    }
  }
  return mergeBufferGeometries(parts.map(nonIndexed));
}

/**
 * The baseplate under the grid: a flat green plate whose top is y = 0, with 2 x 2 studs per cell, so the
 * cells read without grid lines.
 */
export function createBaseplate(gridSize: number, divisions: number, color: string = "#4b9f4a"): THREE.Mesh {
  const cellSize = gridSize / divisions;
  const margin = cellSize * 0.12;
  const thickness = cellSize * 0.12;
  const plateSize = gridSize + margin * 2;

  const plate = new RoundedBoxGeometry(plateSize, thickness, plateSize, 3, thickness * 0.3);
  plate.translate(0, -thickness / 2, 0);

  const parts: THREE.BufferGeometry[] = [plate];
  const studRadius = cellSize * 0.15;
  const studHeight = cellSize * 0.06;
  const studs = divisions * 2;
  for (let i = 0; i < studs; i++) {
    for (let j = 0; j < studs; j++) {
      const stud = new THREE.CylinderGeometry(studRadius, studRadius, studHeight, 20);
      stud.translate(-gridSize / 2 + (i + 0.5) * (cellSize / 2), studHeight / 2 - 0.5, -gridSize / 2 + (j + 0.5) * (cellSize / 2));
      parts.push(stud);
    }
  }

  const mesh = new THREE.Mesh(
    mergeBufferGeometries(parts.map(nonIndexed)),
    new THREE.MeshStandardMaterial({ color: srgb(color), roughness: 0.55, metalness: 0 })
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
