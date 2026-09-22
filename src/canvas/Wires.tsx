import type { Point } from "./camera";
import { HEAD_H, portPos, wirePath } from "./layout";
import { graph, selectEdge, disconnect, portOf, type GraphNode, type GraphState, type PortRef } from "../state/graph";
import { nav } from "../state/nav";
import { jobs, current } from "../state/jobs";

/** where an end of a wire lands at this level: on its port when the node
 *  is here; on the band of the card it is inside when it is deeper; or
 *  nowhere, when it is outside this level altogether — then a short lead
 *  stands in for it, named */
type End = { p: Point; how: "port" | "card" | "outside"; node: GraphNode };

function resolve(g: GraphState, focus: string | null, node: GraphNode, ref: PortRef, dir: "in" | "out"): End {
  if (node.parent === focus) return { p: portPos(node, ref, dir), how: "port", node };
  // deeper: climb to the card at this level that holds it
  let id: string | null = node.parent;
  while (id && g.nodes[id] && g.nodes[id].parent !== focus) id = g.nodes[id].parent;
  const card = id ? g.nodes[id] : undefined;
  if (card && card.parent === focus) {
    return { p: { x: dir === "in" ? card.x : card.x + card.w, y: card.y + HEAD_H / 2 }, how: "card", node: card };
  }
  return { p: { x: 0, y: 0 }, how: "outside", node };
}

/** The wires, in world units: one SVG under the nodes, and the wire being
 *  drawn on top of everything while the pointer holds it. A wire that
 *  crosses a level is drawn as far as it can be seen: into the card that
 *  holds its other end, or as a named lead from beyond this level. */
export function Wires({ live, liveType, lit }: { live: { a: Point; b: Point } | null; liveType?: string; lit: Set<string> | null }) {
  const g = graph.use();
  const focus = nav.use((n) => n.focus);
  // the cables feeding whatever is running carry the work down them
  const running = jobs.use((j) => current(j)?.nodeId);
  const LEAD = 72;
  return (
    <svg className="wires" aria-hidden>
      {Object.values(g.edges).map((e) => {
        const from = g.nodes[e.from.node];
        const to = g.nodes[e.to.node];
        if (!from || !to) return null;
        const a = resolve(g, focus, from, e.from, "out");
        const b = resolve(g, focus, to, e.to, "in");
        if (a.how === "outside" && b.how === "outside") return null;
        if (a.how === "card" && b.how === "card" && a.node.id === b.node.id) return null; // both inside the same card: its own business
        // an end beyond this level: a lead that starts a little way off, named for what it stands in for
        let label: { at: Point; text: string; anchor: "start" | "end" } | null = null;
        if (a.how === "outside") {
          a.p = { x: b.p.x - LEAD, y: b.p.y - 22 };
          label = { at: { x: a.p.x - 4, y: a.p.y - 6 }, text: from.title, anchor: "end" };
        } else if (b.how === "outside") {
          b.p = { x: a.p.x + LEAD, y: a.p.y - 22 };
          label = { at: { x: b.p.x + 4, y: b.p.y - 6 }, text: to.title, anchor: "start" };
        }
        const d = wirePath(a.p, b.p);
        const sel = g.edgeSelection.includes(e.id);
        const dim = !!lit && !(lit.has(a.node.id) && lit.has(b.node.id));
        const type = portOf(e.from, "out")?.type ?? "model";
        const deep = a.how !== "port" || b.how !== "port";
        const live = running === to.id || running === b.node.id;
        return (
          <g key={e.id} className={`wire t-${type}${sel ? " sel" : ""}${dim ? " dim" : ""}${deep ? " deep" : ""}${live ? " working" : ""}`}>
            <title>{`${from.title} → ${to.title}`}</title>
            <path className="wire-hit" d={d} onPointerDown={(ev) => { ev.stopPropagation(); selectEdge(e.id); }} onDoubleClick={(ev) => { ev.stopPropagation(); disconnect(e.id); }} />
            <path className="wire-line" d={d} />
            {a.how === "port" && <circle className="wire-plug" cx={a.p.x} cy={a.p.y} r={3.2} />}
            {b.how === "port" && <circle className="wire-plug" cx={b.p.x} cy={b.p.y} r={3.2} />}
            {label && (
              <text className="wire-from" x={label.at.x} y={label.at.y} textAnchor={label.anchor}>
                {label.text}
              </text>
            )}
          </g>
        );
      })}
      {live && (
        <g className="wire live">
          <path className={`wire-line live t-${liveType ?? "model"}`} d={wirePath(live.a, live.b)} />
          <circle className="wire-plug" cx={live.a.x} cy={live.a.y} r={3.2} />
          <circle className="wire-plug end" cx={live.b.x} cy={live.b.y} r={4.5} />
        </g>
      )}
    </svg>
  );
}
