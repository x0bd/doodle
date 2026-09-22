import type { PointerEvent as ReactPointerEvent } from "react";
import { Icon, ChevronDownIcon, ChevronRightIcon } from "../icons";
import { urlFor, assets } from "../state/assets";
import { KINDS, NODE_ROWS } from "../graph/kinds";
import { graph, inputs, outputs, updateData, childCount, childrenOf, takeOutput, type GraphNode, type PortRef } from "../state/graph";
import { jobs, jobFor } from "../state/jobs";

export interface NodeHandlers {
  onPointerDown: (e: ReactPointerEvent, node: GraphNode) => void;
  onOpen: (node: GraphNode) => void;
  onPortDown: (e: ReactPointerEvent, ref: PortRef, dir: "in" | "out") => void;
}

/** A node: a card with its head, its ports on the edges, and its body by kind. */
export function Node({ node, selected, into, dim, handlers }: { node: GraphNode; selected: boolean; into?: boolean; dim?: boolean; handlers: NodeHandlers }) {
  const ins = inputs(node);
  const outs = outputs(node);
  const edges = graph.use((g) => g.edges);
  const job = jobs.use((s) => (node.kind === "generate" || node.kind === "write" ? jobFor(s, node.id) : undefined));
  const running = job?.state === "running";
  const inside = graph.use((g) => childCount(g, node.id));
  assets.use();
  const connected = (ref: PortRef) =>
    Object.values(edges).some(
      (e) => (e.from.node === ref.node && e.from.port === ref.port) || (e.to.node === ref.node && e.to.port === ref.port),
    );

  const g = graph.get();
  /** what feeds an input, by title */
  const source = (ref: PortRef) => {
    const e = Object.values(edges).find((e) => e.to.node === ref.node && e.to.port === ref.port);
    return e ? g.nodes[e.from.node]?.title : undefined;
  };

  // a sheet: a page or a chapter wears a running head, not a band — its
  // input sits on the head's left edge, its source named in the head
  const sheet = node.kind === "page" || node.kind === "chapter";
  const fedBy = sheet && ins[0] ? source({ node: node.id, port: ins[0].id }) : undefined;

  return (
    <div
      className={`node card k-${node.kind} st-${node.status}${selected ? " sel" : ""}${running ? " running" : ""}${into ? " into" : ""}${dim ? " dim" : ""}${sheet ? " leaf" : ""}`}
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
        {sheet && ins[0] && (() => {
          const p = ins[0];
          const ref = { node: node.id, port: p.id };
          return (
            <button
              className={`port in edge t-${p.type}${fedBy ? " on" : ""}`}
              data-port={`${node.id}:${p.id}`}
              data-dir="in"
              aria-label={`${p.name} input`}
              title={fedBy ? `${p.name} ← ${fedBy} — drag to move the wire` : `${p.name} — drop a wire here`}
              onPointerDown={(e) => handlers.onPortDown(e, ref, "in")}
            >
              <span className="port-dot" />
            </button>
          );
        })()}
        {!sheet && <span className="node-dot" />}
        {sheet ? (
          <span className="node-run">
            <span className="node-run-name">{node.title}</span>
            {node.kind === "chapter" && <span className="node-run-of"> · chapter</span>}
            {fedBy && <span className="node-run-of"> · from {fedBy}</span>}
          </span>
        ) : (
          <span className="node-name">{node.title}</span>
        )}
        {node.status !== "canon" && <span className="node-st">{node.status === "exploration" ? "explore" : node.status}</span>}
        {inside > 0 && <span className="node-inside badge" title={`${inside} inside — double-click to enter`}>{inside}</span>}
        {job && job.state !== "completed" && (
          <span className="node-state px">
            {job.state === "running" ? job.note : job.state === "queued" ? "queued" : job.state === "failed" ? "failed" : "stopped"}
          </span>
        )}
        <button className="node-open pill-icon sm" aria-label="Open" title="Open — double-click or ⏎" onPointerDown={(e) => e.stopPropagation()} onClick={() => handlers.onOpen(node)}>
          <Icon icon={ChevronRightIcon} size={12} strokeWidth={2.2} />
        </button>
        {outs[0] && (() => {
          const p = outs[0];
          const ref = { node: node.id, port: p.id };
          return (
            <button
              className={`port out top t-${p.type}${connected(ref) ? " on" : ""}`}
              data-port={`${node.id}:${p.id}`}
              data-dir="out"
              aria-label={`${p.name} output`}
              title={`${p.name} — drag to wire`}
              onPointerDown={(e) => handlers.onPortDown(e, ref, "out")}
            >
              <span className="port-dot" />
            </button>
          );
        })()}
        {running && (
          <div className="node-progress" aria-hidden>
            <div className="node-progress-bar" style={{ width: `${job.progress * 100}%` }} />
          </div>
        )}
      </div>

      {ins.length > 0 && !sheet && (
        <div className="ins">
          {ins.map((p) => {
            const ref = { node: node.id, port: p.id };
            const from = source(ref);
            return (
              <div key={p.id} className={`in-row${from ? " on" : ""}`}>
                <button
                  className={`port in t-${p.type}${from ? " on" : ""}`}
                  data-port={`${node.id}:${p.id}`}
                  data-dir="in"
                  aria-label={`${p.name} input`}
                  title={from ? `${p.name} ← ${from} — drag to move the wire` : `${p.name} — drop a wire here`}
                  onPointerDown={(e) => handlers.onPortDown(e, ref, "in")}
                >
                  <span className="port-dot" />
                </button>
                <span className="in-name">{p.name}</span>
                {from && <span className="in-from">{from}</span>}
              </div>
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
      return <PageBody node={node} />;
    case "chapter":
      return <ChapterBody node={node} />;
  }
}

const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const fmtCount = (n: number) => n.toLocaleString("en-US");

/** A page on the field is a sheet: the words themselves, written on in
 *  place, and how many there are. Nothing else — the sheet is the invitation. */
function PageBody({ node }: { node: GraphNode }) {
  const text = String(node.data.text ?? "");
  const words = countWords(text);
  return (
    <div className="node-body node-sheet">
      <textarea
        className="sheet-text selectable"
        value={text}
        placeholder="Start writing…"
        onChange={(e) => updateData(node.id, { text: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
        spellCheck
      />
      <div className="sheet-foot px">{words ? `${fmtCount(words)} words` : ""}</div>
    </div>
  );
}

/** A chapter on the field: its pages as a small stack, in order, and the
 *  count. Enter it and the pages are the field. */
function ChapterBody({ node }: { node: GraphNode }) {
  const g = graph.use();
  const pages = childrenOf(g, node.id).map((id) => g.nodes[id]).filter((n) => n.kind === "page").sort((a, b) => a.seq - b.seq);
  const words = pages.reduce((n, p) => n + countWords(String(p.data.text ?? "")), 0);
  const summary = String(node.data.summary ?? "");
  return (
    <div className="node-body node-stack">
      {summary && <p className="stack-line selectable">{summary}</p>}
      {pages.length ? (
        <div className="stack">
          {pages.slice(0, 3).map((p, i) => (
            <div key={p.id} className="stack-sheet" style={{ "--i": i } as React.CSSProperties}>
              <b>{p.title}</b>
              <span>{String(p.data.text ?? "").trim().split("\n")[0] || "—"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="stack-none">No pages yet. Enter it to begin one.</div>
      )}
      <div className="sheet-foot px">
        {pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}${words ? ` · ${fmtCount(words)} words` : ""}` : ""}
      </div>
    </div>
  );
}

const fmt = (v: string | number | undefined) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v ?? ""));
