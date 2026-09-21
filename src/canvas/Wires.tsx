import type { Point } from "./camera";
import { portPos, wirePath } from "./layout";
import { graph, selectEdge } from "../state/graph";
import { nav } from "../state/nav";

/** The wires, in world units: one SVG under the nodes, and the wire being
 *  drawn on top of everything while the pointer holds it. */
export function Wires({ live, lit }: { live: { a: Point; b: Point } | null; lit: Set<string> | null }) {
  const g = graph.use();
  const focus = nav.use((n) => n.focus);
  return (
    <svg className="wires" aria-hidden>
      {Object.values(g.edges).map((e) => {
        const from = g.nodes[e.from.node];
        const to = g.nodes[e.to.node];
        if (!from || !to || from.parent !== focus || to.parent !== focus) return null;
        const d = wirePath(portPos(from, e.from, "out"), portPos(to, e.to, "in"));
        const sel = g.edgeSelection.includes(e.id);
        const dim = !!lit && !(lit.has(e.from.node) && lit.has(e.to.node));
        return (
          <g key={e.id} className={`wire${sel ? " sel" : ""}${dim ? " dim" : ""}`}>
            <path className="wire-hit" d={d} onPointerDown={(ev) => { ev.stopPropagation(); selectEdge(e.id); }} />
            <path className="wire-line" d={d} />
          </g>
        );
      })}
      {live && <path className="wire-line live" d={wirePath(live.a, live.b)} />}
    </svg>
  );
}
