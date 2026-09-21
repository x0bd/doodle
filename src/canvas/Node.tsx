import type { PointerEvent as ReactPointerEvent } from "react";
import type { GraphNode } from "../state/graph";

/** One plain node: a card with a head row and an empty well. The typed
 *  kinds (step 3) build on this. */
export function Node({
  node,
  selected,
  onPointerDown,
}: {
  node: GraphNode;
  selected: boolean;
  onPointerDown: (e: ReactPointerEvent, node: GraphNode) => void;
}) {
  return (
    <div
      className={`node card${selected ? " sel" : ""}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      onPointerDown={(e) => onPointerDown(e, node)}
      role="group"
      aria-label={`${node.title}, ${node.kind}`}
    >
      <div className="node-head">
        <span className="node-dot" />
        <span className="node-name">{node.title}</span>
      </div>
      <div className="node-body well">
        {node.asset && <img className="node-img" src={node.asset} alt="" draggable={false} />}
      </div>
    </div>
  );
}
