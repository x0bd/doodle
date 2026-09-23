/**
 * Where things are on a node, in world units. The CSS and the wires both
 * depend on these figures, so they live in one place.
 */
import type { Point } from "./camera";
import { inputs, outputs, type GraphNode, type PortRef } from "../state/graph";

export const NODE_PAD = 12;
export const HEAD_H = 36; // the head band, flush with the card's top (.node-head)
export const ROWS_TOP = HEAD_H + 6; // 42: the band, then the card's gap (.node-head margin)
export const PORT_ROW = 26; // an input row in the body (.in-row)

/** far out, cards are their heads; every port lands on the band */
let mapMode = false;
export const setMapMode = (on: boolean) => (mapMode = on);

/** the centre of a port's dot. The first output sits on the head band's
 *  right edge; inputs are rows down the left edge of the body; further
 *  outputs (none yet) would follow the inputs. */
export function portPos(node: GraphNode, ref: PortRef, dir: "in" | "out"): Point {
  if (mapMode) return { x: dir === "in" ? node.x : node.x + node.w, y: node.y + HEAD_H / 2 };
  // a sheet (a page, a chapter) takes its one input on the head's left edge
  if (dir === "in" && (node.kind === "page" || node.kind === "chapter")) return { x: node.x, y: node.y + HEAD_H / 2 };
  if (dir === "out") {
    const i = Math.max(0, outputs(node).findIndex((p) => p.id === ref.port));
    if (i === 0) return { x: node.x + node.w, y: node.y + HEAD_H / 2 };
    return { x: node.x + node.w, y: node.y + ROWS_TOP + (inputs(node).length + i - 1) * PORT_ROW + PORT_ROW / 2 };
  }
  const i = Math.max(0, inputs(node).findIndex((p) => p.id === ref.port));
  return { x: node.x, y: node.y + ROWS_TOP + i * PORT_ROW + PORT_ROW / 2 };
}

/** A wire: out of the right edge, into the left, easing both ways — and
 *  hanging a little between them, the way a patch lead does. The sag
 *  grows with the run and stops; on the map it is a straight line. */
export function wirePath(a: Point, b: Point) {
  const dx = Math.max(48, Math.abs(b.x - a.x) * 0.5);
  const sag = mapMode ? 0 : Math.min(30, Math.hypot(b.x - a.x, b.y - a.y) * 0.11);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y + sag}, ${b.x - dx} ${b.y + sag}, ${b.x} ${b.y}`;
}
