import type { Point } from "./camera";
import { portPos, wirePath } from "./layout";
import { graph, selectEdge } from "../state/graph";

/** The wires, in world units: one SVG under the nodes, and the wire being
 *  drawn on top of everything while the pointer holds it. */
export function Wires({ live }: { live: { a: Point; b: Point } | null }) {
  const g = graph.use();
  return (
    <svg className="wires" aria-hidden>
      {Object.values(g.edges).map((e) => {
        const from = g.nodes[e.from.node];
        const to = g.nodes[e.to.node];
        if (!from || !to) return null;
        const d = wirePath(portPos(from, e.from, "out"), portPos(to, e.to, "in"));
        const sel = g.edgeSelection.includes(e.id);
        return (
          <g key={e.id} className={`wire${sel ? " sel" : ""}`}>
            <path className="wire-hit" d={d} onPointerDown={(ev) => { ev.stopPropagation(); selectEdge(e.id); }} />
            <path className="wire-line" d={d} />
          </g>
        );
      })}
      {live && <path className="wire-line live" d={wirePath(live.a, live.b)} />}
    </svg>
  );
}
