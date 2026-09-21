/**
 * Where things are on a node, in world units. The CSS and the wires both
 * depend on these figures, so they live in one place.
 */
import type { Point } from "./camera";
import { inputs, outputs, type GraphNode, type PortRef } from "../state/graph";

export const NODE_PAD = 8;
export const HEAD_H = 22;
export const PORTS_TOP = NODE_PAD + HEAD_H + 6; // 36
export const PORT_ROW = 18;

/** the centre of a port's dot: on the node's edge, at its row */
export function portPos(node: GraphNode, ref: PortRef, dir: "in" | "out"): Point {
  const list = dir === "in" ? inputs(node) : outputs(node);
  const i = Math.max(0, list.findIndex((p) => p.id === ref.port));
  return { x: dir === "in" ? node.x : node.x + node.w, y: node.y + PORTS_TOP + i * PORT_ROW + PORT_ROW / 2 };
}

/** a wire: out of the right edge, into the left, easing both ways */
export function wirePath(a: Point, b: Point) {
  const dx = Math.max(48, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
