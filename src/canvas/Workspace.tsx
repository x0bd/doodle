import { KINDS, NODE_ROWS } from "../graph/kinds";
import { graph, updateData, rename, type GraphNode } from "../state/graph";
import type { Rect } from "./camera";

/** where the plate sits in the entered node's world: above its children */
export const WS_RECT: Rect = { x: 0, y: -300, w: 740, h: 240 };

/** The workspace plate: the entered node itself, large, at the head of
 *  its own field. What it holds sits below. */
export function Workspace({ id }: { id: string }) {
  const node = graph.use((g) => g.nodes[id]);
  if (!node) return null;
  const def = KINDS[node.kind];
  return (
    <section
      className={`ws card k-${node.kind}`}
      style={{ left: WS_RECT.x, top: WS_RECT.y, width: WS_RECT.w, minHeight: WS_RECT.h }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`${node.title} workspace`}
    >
      <header className="ws-head">
        <input className="ws-title" value={node.title} onChange={(e) => rename(node.id, e.target.value)} spellCheck={false} aria-label="Title" />
        <span className="ws-note">{def.title} · {def.note}</span>
      </header>
      <WsBody node={node} />
    </section>
  );
}

function WsBody({ node }: { node: GraphNode }) {
  const set = (patch: Record<string, string | number>) => updateData(node.id, patch);
  switch (node.kind) {
    case "prompt":
    case "note":
      return (
        <textarea
          className="ws-text"
          value={String(node.data.text ?? "")}
          placeholder={node.kind === "note" ? "A thought" : "What you want to get"}
          onChange={(e) => set({ text: e.target.value })}
          spellCheck={false}
        />
      );
    case "page":
      return node.data.text ? (
        <p className="ws-read selectable">{String(node.data.text)}</p>
      ) : (
        <p className="ws-empty">Nothing written yet. Wire a writer in and run.</p>
      );
    case "character":
      return (
        <div className="ws-char">
          <div className={`ws-ref well${node.asset ? "" : " diag"}`}>
            {node.asset && <img className="node-img" src={node.asset} alt="" draggable={false} />}
          </div>
          <div className="ws-fields">
            <label className="ws-field">
              <span className="lbl">Name</span>
              <input className="inp" value={String(node.data.name ?? "")} onChange={(e) => set({ name: e.target.value })} spellCheck={false} />
            </label>
            <label className="ws-field grow">
              <span className="lbl">Appearance</span>
              <textarea className="inp" rows={4} value={String(node.data.description ?? "")} onChange={(e) => set({ description: e.target.value })} spellCheck={false} />
            </label>
          </div>
        </div>
      );
    case "style":
      return (
        <div className="ws-fields">
          <label className="ws-field">
            <span className="lbl">Description</span>
            <textarea className="inp" rows={3} value={String(node.data.description ?? "")} onChange={(e) => set({ description: e.target.value })} spellCheck={false} />
          </label>
          <div className="ws-two">
            <label className="ws-field">
              <span className="lbl">Palette</span>
              <input className="inp" value={String(node.data.palette ?? "")} onChange={(e) => set({ palette: e.target.value })} spellCheck={false} />
            </label>
            <label className="ws-field">
              <span className="lbl">Lighting</span>
              <input className="inp" value={String(node.data.lighting ?? "")} onChange={(e) => set({ lighting: e.target.value })} spellCheck={false} />
            </label>
          </div>
        </div>
      );
    case "preview":
      return (
        <div className="ws-image well">
          {node.asset ? <img className="node-img contain" src={node.asset} alt="" draggable={false} /> : <p className="ws-empty">Nothing yet. Run the graph.</p>}
        </div>
      );
    default: {
      const rows = NODE_ROWS[node.kind] ?? [];
      return (
        <div className="ws-rows">
          {rows.map((r) => (
            <div key={r.key} className="node-row">
              <span className="node-row-k">{r.label}</span>
              <span className="node-row-v px">{String(node.data[r.key] ?? "")}</span>
            </div>
          ))}
          {node.kind === "model" && (
            <div className="node-row">
              <span className="node-row-k">Checkpoint</span>
              <span className="node-row-v">{String(node.data.model)}</span>
            </div>
          )}
          {!rows.length && node.kind !== "model" && <p className="ws-empty">Its settings are in the inspector.</p>}
        </div>
      );
    }
  }
}
