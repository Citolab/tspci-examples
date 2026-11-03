// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/svgmap, © OpenPCI (Aarhus University and Aalborg University):
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard.
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026.

import { ComponentChildren, JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { MapModel } from "./map";

// The map with a layer on top of it, in one <svg> with the map's viewBox: the route is drawn in the coordinates of the
// map, so it scales with it. `overlay` gets the size of one CSS pixel in map units, to keep lines and markers the same
// size on screen whatever the size of the map.

export type MapPoint = { x: number; y: number };

type Props = Omit<JSX.SVGAttributes<SVGSVGElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerLeave" | "onPointerCancel"> & {
  map: MapModel;
  /** At most this part of the window's height (a tall map gets narrower). */
  maxHeight?: number;
  overlay: (px: number) => ComponentChildren;
  onPointerDown?: (e: PointerEvent, at: MapPoint | null, px: number) => void;
  onPointerMove?: (e: PointerEvent, at: MapPoint | null, px: number) => void;
  onPointerUp?: (e: PointerEvent, at: MapPoint | null, px: number) => void;
  onPointerLeave?: (e: PointerEvent) => void;
  onPointerCancel?: (e: PointerEvent) => void;
};

export const MapCanvas = ({ map, maxHeight = 80, overlay, onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, ...rest }: Props) => {
  const outer = useRef<SVGSVGElement>(null);
  const host = useRef<SVGGElement>(null);
  const [px, setPx] = useState(map.viewBox.width / 600);

  useLayoutEffect(() => {
    if (host.current && map.svg && map.svg.parentNode !== host.current) host.current.replaceChildren(map.svg);
    if (host.current && !map.svg) host.current.replaceChildren();
  }, [map]);

  useLayoutEffect(() => {
    const element = outer.current;
    if (!element) return;
    const update = () => {
      const scale = element.getScreenCTM()?.a;
      if (scale > 0) setPx(1 / scale);
    };
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [map]);

  const at = (e: PointerEvent): MapPoint | null => {
    const m = outer.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const { x, y, width, height } = map.viewBox;
  return (
    <svg ref={outer} viewBox={`${x} ${y} ${width} ${height}`} xmlns="http://www.w3.org/2000/svg"
      className="mx-auto block h-auto touch-none select-none"
      style={{ width: `min(100%, calc(${maxHeight}vh * ${width / height}))` }}
      onPointerDown={onPointerDown && ((e) => onPointerDown(e, at(e), px))}
      onPointerMove={onPointerMove && ((e) => onPointerMove(e, at(e), px))}
      onPointerUp={onPointerUp && ((e) => onPointerUp(e, at(e), px))}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      {...rest}>
      <g ref={host} />
      {overlay(px)}
    </svg>
  );
};

/** A route as the points of a polyline. */
export const pointsOf = (map: MapModel, ids: number[]) => ids.map((id) => `${map.nodes[id].x},${map.nodes[id].y}`).join(" ");
