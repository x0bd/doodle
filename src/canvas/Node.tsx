import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon, ChevronDownIcon } from "../icons";
import { urlFor, assets } from "../state/assets";
import { KINDS, NODE_ROWS } from "../graph/kinds";
import { graph, inputs, outputs, updateData, childCount, takeOutput, type GraphNode, type PortRef } from "../state/graph";
import { jobs, jobFor } from "../state/jobs";

export interface NodeHandlers {
  onPointerDown: (e: ReactPointerEvent, node: GraphNode) => void;
  onPortDown: (e: ReactPointerEvent, ref: PortRef, dir: "in" | "out") => void;
}

/** A node: a card with its head, its ports on the edges, and its body by kind. */
export function Node({ node, selected, into, handlers }: { node: GraphNode; selected: boolean; into?: boolean; handlers: NodeHandlers }) {
  const ins = inputs(node);
  const outs = outputs(node);
  const rows = Math.max(ins.length, outs.length);
  const edges = graph.use((g) => g.edges);
  const job = jobs.use((s) => (node.kind === "generate" || node.kind === "write" ? jobFor(s, node.id) : undefined));
  const running = job?.state === "running";
  const inside = graph.use((g) => childCount(g, node.id));
  assets.use();
  const connected = (ref: PortRef) =>
    Object.values(edges).some(
      (e) => (e.from.node === ref.node && e.from.port === ref.port) || (e.to.node === ref.node && e.to.port === ref.port),
    );

  return (
    <div
      className={`node card k-${node.kind} st-${node.status}${selected ? " sel" : ""}${running ? " running" : ""}${into ? " into" : ""}`}
      style={
        node.kind === "generate" && node.outputs?.length
          ? { left: node.x, top: node.y, width: node.w, minHeight: node.h }
          : { left: node.x, top: node.y, width: node.w, height: node.h }
      }
      data-node={node.id}
      onPointerDown={(e) => handlers.onPointerDown(e, node)}
      role="group"
      aria-label={`${node.title}, ${KINDS[node.kind].title}`}
    >
      <div className="node-head">
        <span className="node-dot" />
        <span className="node-name">{node.title}</span>
        {node.status !== "canon" && <span className="node-st">{node.status === "exploration" ? "explore" : node.status}</span>}
        {inside > 0 && <span className="node-inside badge" title={`${inside} inside — double-click to enter`}>{inside}</span>}
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
    case "generate": {
      const outs = node.outputs ?? [];
      return (
        <div className="node-body node-rows">
          {(NODE_ROWS.generate ?? []).map((r) => (
            <div key={r.key} className="node-row">
              <span className="node-row-k">{r.label}</span>
              <span className="node-row-v px">{fmt(node.data[r.key])}</span>
            </div>
          ))}
          {outs.length > 0 && (
            <div className="bloom" role="radiogroup" aria-label="Candidates">
              {outs.slice(-4).map((ref) => {
                const url = urlFor(ref);
                const on = node.asset === ref;
                return (
                  <button
                    key={ref}
                    className={`bloom-take${on ? " on" : ""}`}
                    role="radio"
                    aria-checked={on}
                    title={on ? "The take" : "Make this the take"}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => !on && takeOutput(node.id, ref)}
                  >
                    {url && <img src={url} alt="" draggable={false} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    case "preview":
      return (
        <div className="node-body well">
          {node.asset && <img className="node-img" src={urlFor(node.asset)} alt="" draggable={false} />}
        </div>
      );
    case "character":
      return (
        <div className="node-body node-char">
          <div className={`node-ref well${node.asset ? "" : " diag"}`}>
            {node.asset && <img className="node-img" src={urlFor(node.asset)} alt="" draggable={false} />}
          </div>
          <div className="node-char-what">
            <div className="node-char-name">{String(node.data.name || node.title)}</div>
            <div className="node-char-desc">{String(node.data.description || "No description yet")}</div>
          </div>
        </div>
      );
    case "style":
      return (
        <div className="node-body node-rows">
          <div className="node-desc">{String(node.data.description || "No description yet")}</div>
          {(NODE_ROWS.style ?? []).filter((r) => node.data[r.key]).map((r) => (
            <div key={r.key} className="node-row">
              <span className="node-row-k">{r.label}</span>
              <span className="node-row-v">{String(node.data[r.key])}</span>
            </div>
          ))}
        </div>
      );
    case "write":
      return (
        <div className="node-body node-rows">
          {(NODE_ROWS.write ?? []).map((r) => (
            <div key={r.key} className="node-row">
              <span className="node-row-k">{r.label}</span>
              <span className="node-row-v">{String(node.data[r.key])}</span>
            </div>
          ))}
        </div>
      );
    case "shot":
      return (
        <div className="node-body node-shot">
          <p className="node-desc">{String(node.data.description || "What the camera sees")}</p>
          <span className="node-cam px">{String(node.data.shotSize)} · {String(node.data.lensMm)}mm · {String(node.data.movement)}</span>
        </div>
      );
    case "note":
      return (
        <div className="node-body well">
          <textarea
            className="node-text"
            value={String(node.data.text ?? "")}
            placeholder="A thought"
            onChange={(e) => updateData(node.id, { text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            spellCheck={false}
          />
        </div>
      );
    case "page":
      return (
        <div className="node-body well node-page">
          {node.data.text ? <p className="node-page-text selectable">{String(node.data.text)}</p> : <p className="node-page-empty">Nothing written yet</p>}
        </div>
      );
  }
}

const fmt = (v: string | number | undefined) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v ?? ""));
