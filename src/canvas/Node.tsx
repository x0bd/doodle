import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon, ChevronDownIcon } from "../icons";
import { KINDS, NODE_ROWS } from "../graph/kinds";
import { graph, inputs, outputs, updateData, type GraphNode, type PortRef } from "../state/graph";
import { jobs, jobFor } from "../state/jobs";

export interface NodeHandlers {
  onPointerDown: (e: ReactPointerEvent, node: GraphNode) => void;
  onPortDown: (e: ReactPointerEvent, ref: PortRef, dir: "in" | "out") => void;
}

/** A node: a card with its head, its ports on the edges, and its body by kind. */
export function Node({ node, selected, handlers }: { node: GraphNode; selected: boolean; handlers: NodeHandlers }) {
  const ins = inputs(node);
  const outs = outputs(node);
  const rows = Math.max(ins.length, outs.length);
  const edges = graph.use((g) => g.edges);
  const job = jobs.use((s) => (node.kind === "generate" ? jobFor(s, node.id) : undefined));
  const running = job?.state === "running";
  const connected = (ref: PortRef) =>
    Object.values(edges).some(
      (e) => (e.from.node === ref.node && e.from.port === ref.port) || (e.to.node === ref.node && e.to.port === ref.port),
    );

  return (
    <div
      className={`node card k-${node.kind}${selected ? " sel" : ""}${running ? " running" : ""}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      onPointerDown={(e) => handlers.onPointerDown(e, node)}
      role="group"
      aria-label={`${node.title}, ${KINDS[node.kind].title}`}
    >
      <div className="node-head">
        <span className="node-dot" />
        <span className="node-name">{node.title}</span>
        {job && job.state !== "completed" && (
          <span className="node-state px">
            {job.state === "running" ? job.note : job.state === "queued" ? "queued" : job.state === "failed" ? "failed" : "stopped"}
          </span>
        )}
        {running && (
          <div className="node-progress" aria-hidden>
            <div className="node-progress-bar" style={{ width: `${job.progress * 100}%` }} />
          </div>
        )}
      </div>

      {rows > 0 && (
        <div className="ports" style={{ height: rows * 18 }}>
          {ins.map((p, i) => {
            const ref = { node: node.id, port: p.id };
            return (
              <button
                key={p.id}
                className={`port in${connected(ref) ? " on" : ""}`}
                style={{ top: i * 18 }}
                data-port={`${node.id}:${p.id}`}
                data-dir="in"
                aria-label={`${p.name} input`}
                onPointerDown={(e) => handlers.onPortDown(e, ref, "in")}
              >
                <span className="port-dot" />
                <span className="port-name">{p.name}</span>
              </button>
            );
          })}
          {outs.map((p, i) => {
            const ref = { node: node.id, port: p.id };
            return (
              <button
                key={p.id}
                className={`port out${connected(ref) ? " on" : ""}`}
                style={{ top: i * 18 }}
                data-port={`${node.id}:${p.id}`}
                data-dir="out"
                aria-label={`${p.name} output`}
                onPointerDown={(e) => handlers.onPortDown(e, ref, "out")}
              >
                <span className="port-name">{p.name}</span>
                <span className="port-dot" />
              </button>
            );
          })}
        </div>
      )}

      <Body node={node} />
    </div>
  );
}

function Body({ node }: { node: GraphNode }) {
  switch (node.kind) {
    case "model":
      return (
        <div className="node-body">
          <div className="pill pill-sm node-select" title="Change in the inspector">
            <span className="list-word">{String(node.data.model)}</span>
            <Icon icon={ChevronDownIcon} size={11} strokeWidth={2.2} />
          </div>
        </div>
      );
    case "prompt":
      return (
        <div className="node-body well">
          <textarea
            className="node-text"
            value={String(node.data.text ?? "")}
            placeholder={node.title === "Negative" ? "What you do not want" : "What you want to get"}
            onChange={(e) => updateData(node.id, { text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            spellCheck={false}
          />
        </div>
      );
    case "generate":
      return (
        <div className="node-body node-rows">
          {(NODE_ROWS.generate ?? []).map((r) => (
            <div key={r.key} className="node-row">
              <span className="node-row-k">{r.label}</span>
              <span className="node-row-v px">{fmt(node.data[r.key])}</span>
            </div>
          ))}
        </div>
      );
    case "preview":
      return (
        <div className="node-body well">
          {node.asset && <img className="node-img" src={node.asset} alt="" draggable={false} />}
        </div>
      );
  }
}

const fmt = (v: string | number | undefined) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v ?? ""));
