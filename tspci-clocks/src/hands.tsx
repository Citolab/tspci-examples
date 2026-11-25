import type { PciProperties } from "@citolab/tspci";
// import { IStore, useStore } from "@citolab/preact-store";
import LongHand from "./img/longhand.png";
import ShortHand from "./img/shorthand.png";
import configProps from "./config.json";
/**
 * Hand images, measured in pixels: the image size, the centre of the round knob at the bottom (the pivot) and the tip.
 * `reach` is how far the tip reaches from the clock centre, as a fraction of the clock face's width.
 */
type PropTypes = PciProperties<typeof configProps>;

export const HANDS = {
  long: { src: LongHand, width: 169, height: 547, pivotX: 85, pivotY: 503, tipY: 41, reach: 0.4 },
  short: { src: ShortHand, width: 154, height: 410, pivotX: 77, pivotY: 376, tipY: 27, reach: 0.28 },
};

export type HandName = keyof typeof HANDS;

/** A hand with its pivot on the centre of the clock face, rotated `angle` degrees clockwise from 12. */
export const Hand = ({ hand, angle }: { hand: (typeof HANDS)[HandName]; angle: number }) => {
  const height = (hand.reach * hand.height) / (hand.pivotY - hand.tipY); // fraction of the face
  const width = (height * hand.width) / hand.height;
  const originX = hand.pivotX / hand.width;
  const originY = hand.pivotY / hand.height;
  return (
    // The clock face handles the pointer (see pickHand), so the transparent corners of the image do not get in the way.
    <img
      className="absolute max-w-none pointer-events-none select-none"
      src={hand.src}
      alt={""}
      draggable={false}
      style={{
        width: `${width * 100}%`,
        height: `${height * 100}%`,
        left: `${(0.5 - width * originX) * 100}%`,
        top: `${(0.5 - height * originY) * 100}%`,
        transformOrigin: `${originX * 100}% ${originY * 100}%`,
        transform: `rotate(${angle}deg)`,
      }}
    />
  );
};

/** Where the pointer is on the clock face: degrees clockwise from 12 (0-360), and the distance from the centre as a fraction of the face's width. */
export function pointerOnFace(face: HTMLElement, e: PointerEvent) {
  const rect = face.getBoundingClientRect();
  const dx = e.clientX - (rect.left + rect.width / 2);
  const dy = e.clientY - (rect.top + rect.height / 2);
  const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  return { angle, distance: Math.hypot(dx, dy) / rect.width };
}

/** Difference between two angles in degrees, 0-180. */
export const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * The hand the pointer grabs: the one whose direction is closest to the pointer (within 20 degrees), on the hand
 * itself (not beyond its tip). When both point the same way, the short hand near the centre, the long hand further out.
 */
export function pickHand(
  pointer: { angle: number; distance: number },
  angles: Record<HandName, number>,
  config: PropTypes
): HandName | null {
  if (config.typeOfQuestion !== "setClock") {
    return null;
  } else {
    const candidates = (Object.keys(HANDS) as HandName[])
      .filter((name) => pointer.distance <= HANDS[name].reach + 0.03 && angleDiff(pointer.angle, angles[name]) <= 20)
      .sort((a, b) => angleDiff(pointer.angle, angles[a]) - angleDiff(pointer.angle, angles[b]));
    if (candidates.length === 2 && angleDiff(angles.long, angles.short) <= 20) {
      return pointer.distance <= HANDS.short.reach ? "short" : "long";
    }
    return candidates[0] ?? null;
  }

}
