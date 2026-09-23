import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Icon, PopUpIcon, ChevronRightIcon, ImageIcon } from "../icons";
import { thumbFor, assets } from "../state/assets";
import { KINDS } from "../graph/kinds";
import { FieldRow } from "../shell/Fields";
import { graph, inputs, outputs, updateData, childCount, childrenOf, measure, setWidth, takeOutput, type GraphNode, type PortRef } from "../state/graph";
import { camera } from "./camera";
import { jobs, jobFor, partialFor } from "../state/jobs";
import { Editor } from "../writer/Editor";
import { plain, formOf, countWords } from "../writer/markup";

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
  /** what feeds an input */
  const source = (ref: PortRef) => {
    const e = Object.values(edges).find((e) => e.to.node === ref.node && e.to.port === ref.port);
    return e ? g.nodes[e.from.node] : undefined;
  };

  // a sheet: a page or a chapter wears a running head, not a band — its
  // input sits on the head's left edge, its source named in the head
  const sheet = node.kind === "page" || node.kind === "chapter";
  const fedBy = sheet && ins[0] ? source({ node: node.id, port: ins[0].id })?.title : undefined;

  // the card is as tall as what it holds; the engine is told what that is
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure(node.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id]);

  return (
    <div
      className={`node card k-${node.kind} st-${node.status}${selected ? " sel" : ""}${running ? " running" : ""}${into ? " into" : ""}${dim ? " dim" : ""}${sheet ? " leaf" : ""}`}
      ref={box}
      style={{ left: node.x, top: node.y, width: node.w }}
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
            {fedBy && <span className="node-run-of">from {fedBy}</span>}
          </span>
        ) : (
          <span className="node-name">{node.title}</span>
        )}
        {node.status !== "canon" && <span className="node-st">{STATE_WORD[node.status]}</span>}
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
            const src = source(ref);
            const from = src?.title;
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
                {src && (
                  <span className={`in-from k-${src.kind}`}>
                    <i aria-hidden />
                    <span>{src.title}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Body node={node} />

      {/* the card's edge: drag it and the card is as wide as you want it */}
      <button
        className="node-grip"
        tabIndex={-1}
        aria-label="Width"
        title="Drag to set the width"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          const from = e.clientX;
          const was = node.w;
          const move = (ev: PointerEvent) => setWidth(node.id, was + (ev.clientX - from) / camera.get().zoom);
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", up);
        }}
        onDoubleClick={(e) => (e.stopPropagation(), setWidth(node.id, KINDS[node.kind].size.w))}
      />
    </div>
  );
}

function Body({ node }: { node: GraphNode }) {
  switch (node.kind) {
    case "model":
      return (
        <div className="node-body">
          <div className="node-select" title="Change in the inspector">
            <span className="list-word">{String(node.data.model)}</span>
            <Icon icon={PopUpIcon} size={12} strokeWidth={2} />
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
        <div className="node-body node-form">
          <Form node={node} bare />
          {outs.length > 0 && <div className="node-rule">Takes</div>}
          {outs.length > 0 && (
            <div className="bloom" role="radiogroup" aria-label="Candidates">
              {outs.slice(-4).map((ref, i) => {
                const url = thumbFor(ref, 256);
                const on = node.asset === ref;
                return (
                  <button
                    key={`${i}:${ref}`}
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
        <div className={`node-body node-print${node.asset ? " has" : ""}`}>
          {node.asset ? (
            <img className="node-img" src={thumbFor(node.asset, 1024)} alt="" draggable={false} />
          ) : (
            <span className="node-print-none">
              <Icon icon={ImageIcon} size={20} strokeWidth={1.5} />
              <span>Nothing yet</span>
            </span>
          )}
        </div>
      );
    case "character": {
      // a person the way a contact card has one: the face in a round, or
      // their initials on their own colour until there is a face
      const name = String(node.data.name || node.title);
      return (
        <div className="node-body node-who">
          <div className="who-face">
            {node.asset ? <img className="node-img" src={thumbFor(node.asset, 256)} alt="" draggable={false} /> : <span>{initials(name)}</span>}
          </div>
          <div className="who-what">
            <div className="who-name">{name}</div>
            <div className="who-desc">{String(node.data.description || "No description yet")}</div>
          </div>
        </div>
      );
    }
    case "location":
      // a place the way a map card has one: the view across the top, then its name
      return (
        <div className="node-body node-place">
          <div className={`place-view${node.asset ? " has" : ""}`}>
            {node.asset && <img className="node-img" src={thumbFor(node.asset, 512)} alt="" draggable={false} />}
          </div>
          <div className="who-name">{String(node.data.name || node.title)}</div>
          <div className="who-desc">{String(node.data.description || "No description yet")}</div>
        </div>
      );
    case "style":
      return <Form node={node} />;
    case "write":
      return <Form node={node} />;
    case "shot":
      return <Form node={node} />;
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

const STATE_WORD: Record<GraphNode["status"], string> = { canon: "Canon", draft: "Draft", exploration: "Explore", rejected: "Rejected" };
const initials = (name: string) =>
  name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

const fmtCount = (n: number) => n.toLocaleString("en-US");

/** A page on the field is a sheet: the words themselves, written on in
 *  place, and how many there are. Nothing else — the sheet is the invitation. */
function PageBody({ node }: { node: GraphNode }) {
  const j = jobs.use();
  // the folio: where this page falls among its own
  const folio = graph.use((g) =>
    childrenOf(g, node.parent)
      .map((id) => g.nodes[id])
      .filter((n) => n.kind === "page")
      .sort((a, b) => a.seq - b.seq)
      .findIndex((n) => n.id === node.id) + 1,
  );
  // a writer at work shows its words here as they come; they are not the page yet
  const partial = partialFor(j, node.id);
  const text = partial ?? String(node.data.text ?? "");
  const form = formOf(node.data);
  const words = countWords(text, form);
  return (
    <div className="node-body node-sheet">
      <Editor
        value={text}
        form={form}
        onChange={(v) => updateData(node.id, { text: v })}
        readOnly={partial !== undefined}
        className={`sheet-text selectable${partial !== undefined ? " arriving" : ""}${form === "screenplay" ? " screenplay" : ""}`}
        placeholder={form === "screenplay" ? "INT. SOMEWHERE — NIGHT" : "Start writing…"}
      />
      <div className="sheet-foot px">
        <span>{partial !== undefined ? "writing…" : words ? `${fmtCount(words)} words` : ""}</span>
        <span className="sheet-folio">{folio || ""}</span>
      </div>
    </div>
  );
}

/** A chapter on the field: a sheet with its pages stacked under it — its
 *  summary, its contents in order, and the count. Enter it and the pages
 *  are the field. */
const SHOWN = 5;
function ChapterBody({ node }: { node: GraphNode }) {
  const g = graph.use();
  const pages = childrenOf(g, node.id).map((id) => g.nodes[id]).filter((n) => n.kind === "page").sort((a, b) => a.seq - b.seq);
  const words = pages.reduce((n, p) => n + countWords(String(p.data.text ?? ""), formOf(p.data)), 0);
  const summary = String(node.data.summary ?? "");
  return (
    <div className="node-body node-stack">
      {summary && <p className="stack-line selectable">{summary}</p>}
      {pages.length ? (
        // its contents, the way a book lists them: the page's name, how it
        // opens, and where it falls
        <ol className="toc">
          {pages.slice(0, SHOWN).map((p, i) => (
            <li key={p.id} className="toc-row">
              <span className="toc-what">
                <b>{p.title}</b>
                <span>{plain(String(p.data.text ?? ""), formOf(p.data)).trim().split("\n")[0] || "Not begun"}</span>
              </span>
              <span className="toc-n px">{i + 1}</span>
            </li>
          ))}
          {pages.length > SHOWN && <li className="toc-more">and {pages.length - SHOWN} more</li>}
        </ol>
      ) : (
        <div className="stack-none">No pages yet. Enter it to begin one.</div>
      )}
      <div className="sheet-foot px">
        <span>{pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}${words ? ` · ${fmtCount(words)} words` : ""}` : ""}</span>
      </div>
    </div>
  );
}

/** The card's own settings, set here: the fields the kind declares,
 *  through the same FieldRow the inspector uses — one registry, two
 *  places — drawn flat, since a card is a card and not a control panel. */
function Form({ node, bare }: { node: GraphNode; bare?: boolean }) {
  const groups = KINDS[node.kind].groups;
  const form = groups.map((g, i) => (
    <div key={g.name} className="node-part">
      {(groups.length > 1 || i > 0 || node.kind === "generate") && <div className="node-rule">{g.name}</div>}
      {g.fields.map((f) => (
        <FieldRow key={f.key} node={node} field={f} />
      ))}
    </div>
  ));
  return bare ? <>{form}</> : <div className="node-body node-form">{form}</div>;
}

