import type { PciProperties } from "@citolab/tspci";
import { IStore, useStore } from "@citolab/preact-store";
import { useRef } from "preact/hooks";
import configProps from "./config.json";
import { angleDiff, Hand, HandName, HANDS, pickHand, pointerOnFace } from "./hands";
import ClockFace from "./img/clockface.png";
import { analogSkin, DrawnClock } from "./skins";
import { Actions, StateModel } from "./store";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the answer, but do not change it
};

/** An analog clock face whose hands the student drags; the time goes into the store (SET_TIME). */
export function AnalogClock({ config, store, readOnly }: Props) {
  // const { hour, minute } = useStore(store); // re-renders when the store changes
  const face = useRef<HTMLDivElement>(null);
  const dragging = useRef<HandName | null>(null);

  const state = useStore(store);
  const skin = analogSkin(config.skin); // how it looks (skins.tsx); the hands work the same in every skin
  const [, initialHour, initialMinute] = /(\d{1,2}):(\d{2})/.exec(config.initialtime ?? "") ?? [];
  const hour = state.hour ?? Number(initialHour ?? 12);
  const minute = state.minute ?? Number(initialMinute ?? 0);

  // Time as minutes since 12:00 (0-719); no time yet shows 12:00.
  const total = (hour ?? 0) * 60 + (minute ?? 0);
  const angles = { long: (total % 60) * 6, short: total / 2 };

  // The angles the long hand may stop at for a minute step (minutePerAngle) of 5 or 15; with 1 it stops at every minute.
  const anglesIn5 = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const anglesIn15 = [0, 90, 180, 270];
  const step = Number(config.minutePerJumps) || 1; // settings arrive as strings
  const snapAngles = step === 5 ? anglesIn5 : step === 15 ? anglesIn15 : null;
  /** The allowed angle closest to `angle` (also across 12, so 350 snaps to 0). */
  const snap = (angle: number) =>
    snapAngles ? snapAngles.reduce((best, a) => (angleDiff(angle, a) < angleDiff(angle, best) ? a : best)) : angle;

  const setTotal = (t: number) => {
    const next = ((Math.round(t) % 720) + 720) % 720;
    if (next === total && hour !== null) return;
    store.dispatch({ type: "SET_TIME", payload: { hour: Math.floor(next / 60), minute: next % 60 } });
  };

  const onPointerDown = (e: PointerEvent) => {
    if (readOnly) return;
    const hand = pickHand(pointerOnFace(face.current, e), angles, config);
    if (!hand) return;
    dragging.current = hand;
    face.current.setPointerCapture(e.pointerId); // keep getting moves, also outside the clock
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const { angle } = pointerOnFace(face.current, e);
    if (dragging.current === "short") {
      // The short hand sets the whole time, rounded to the step; the long hand follows, as on a real clock.
      setTotal(Math.round((angle * 2) / step) * step);
    } else {
      // The long hand sets the minutes; passing 12 moves the hour on (or back), as on a real clock.
      const pointed = Math.round(snap(angle) / 6) % 60; // the minute the long hand snaps to
      const diff = ((((pointed - (total % 60)) % 60) + 90) % 60) - 30; // -30 to 29 minutes
      setTotal(total + diff);
    }
  };

  const onPointerUp = () => (dragging.current = null);

  return (
      <div
        ref={face}
        className={`relative w-[20em] h-[20em] touch-none select-none ${readOnly ? "" : "cursor-pointer"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {skin === "classic" ? (
          <>
            <img className="block w-full h-full" src={ClockFace} alt={""} draggable={false}></img>
            <Hand hand={HANDS.short} angle={angles.short} />
            <Hand hand={HANDS.long} angle={angles.long} />
          </>
        ) : (
          <DrawnClock skin={skin} angles={angles} />
        )}
      </div>
  );
}
