import { memo, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Icon, PopUpIcon, ChevronRightIcon, ImageIcon, GenerateIcon } from "../icons";
import { thumbFor, assets } from "../state/assets";
import { KINDS } from "../graph/kinds";
import { FieldRow } from "../shell/Fields";
import { graph, inputs, outputs, updateData, childCount, childrenOf, measure, setWidth, setSize, takeOutput, paginate, type GraphNode, type PortRef } from "../state/graph";
import { camera, toWorld } from "./camera";
import { setOnField, giveLook } from "../state/remix";
import { generateLook } from "../state/looks";
import { jobs, jobFor, partialFor } from "../state/jobs";
import { Editor } from "../writer/Editor";
import { plain, formOf, countWords } from "../writer/markup";

export interface NodeHandlers {
  onPointerDown: (e: ReactPointerEvent, node: GraphNode) => void;
  onOpen: (node: GraphNode) => void;
  onPortDown: (e: ReactPointerEvent, ref: PortRef, dir: "in" | "out") => void;
}

/** A node: a card with its head, its ports on the edges, and its body by kind. */
/** A card re-renders when what it shows changes — its node, its state on
 *  the field — not when another card does (the handlers never change). */
export const Node = memo(Card);

function Card(props: { node: GraphNode; selected: boolean; into?: boolean; dim?: boolean; handlers: NodeHandlers }) {
  return props.node.kind === "group" ? <Group {...props} /> : <Sheet {...props} />;
}

/** A group on a board: not a card but a quiet ground behind what it holds,
 *  its name above them. Dragged, what lies inside comes with it (Canvas);
 *  its corner sets its size. */
function Group({ node, selected, dim, handlers }: { node: GraphNode; selected: boolean; dim?: boolean; handlers: NodeHandlers }) {
  return (
    <div
      className={`node group-frame${selected ? " sel" : ""}${dim ? " dim" : ""}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      data-node={node.id}
      onPointerDown={(e) => handlers.onPointerDown(e, node)}
      role="group"
      aria-label={`${node.title}, a group`}
    >
      <span className="frame-name">{node.title}</span>
      <button
        className="frame-grip"
        tabIndex={-1}
        aria-label="Size"
        title="Drag to size the group"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          const from = { x: e.clientX, y: e.clientY };
          const was = { w: node.w, h: node.h };
          const move = (ev: PointerEvent) => {
            const z = camera.get().zoom;
            setSize(node.id, Math.max(200, was.w + (ev.clientX - from.x) / z), Math.max(120, was.h + (ev.clientY - from.y) / z));
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", up);
        }}
      />
    </div>
  );
}

function Sheet({ node, selected, into, dim, handlers }: { node: GraphNode; selected: boolean; into?: boolean; dim?: boolean; handlers: NodeHandlers }) {
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
      className={`node card k-${node.kind}${node.kind === "clip" ? ` what-${node.data.what}` : ""} st-${node.status}${selected ? " sel" : ""}${running ? " running" : ""}${into ? " into" : ""}${dim ? " dim" : ""}${sheet ? " leaf" : ""}`}
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
        {node.status !== "canon" && node.kind !== "clip" && node.kind !== "board" && <span className="node-st">{STATE_WORD[node.status]}</span>}
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
            placeholder={promptHint(node.title)}
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
                    title={on ? "The take — drag it out to set it on the field" : "Make this the take — drag it out to set it on the field"}
                    onPointerDown={(e) => pullOut(e, ref, url, () => !on && takeOutput(node.id, ref))}
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
            {/* a face from their appearance, without opening them: four to choose from, in their studio */}
            <button
              className="who-make"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => (e.stopPropagation(), generateLook(node.id, "portrait"))}
              aria-label={node.asset ? `New portraits of ${name}` : `Generate a face for ${name}`}
              title={node.asset ? "Four new portraits — open them to choose" : "Generate a face from their appearance — open them to choose"}
            >
              <Icon icon={GenerateIcon} size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="who-what">
            <div className="who-name">{name}</div>
            <div className="who-desc">{String(node.data.description || "No description yet")}</div>
          </div>
        </div>
      );
    }
    case "location":
    case "object":
      // a place the way a map card has one (a thing the same: what it looks like, then its name): the view across the top, then its name
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
      // its references (M3.7) across the top: they ride with it into what it is wired to
      return node.attachments?.length ? (
        <div className="node-body node-form">
          <div className="style-refs" title="The pictures this style was made from — they go with it into image requests">
            {node.attachments.slice(0, 4).map((r, i) => {
              const url = thumbFor(r, 256);
              return <span key={`${i}:${r}`}>{url && <img src={url} alt="" draggable={false} />}</span>;
            })}
          </div>
          <Form node={node} bare />
        </div>
      ) : (
        <Form node={node} />
      );
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
    case "board":
      return <BoardBody node={node} />;
    case "clip":
      return <ClipBody node={node} />;
    case "group":
      return null;
  }
}

/** a document's kind, the way the Finder names it */
const KIND_WORD: Record<string, string> = { pdf: "PDF", docx: "Word", md: "Markdown", markdown: "Markdown", txt: "Text", text: "Text", fountain: "Fountain" };
/** what an empty prompt card says, by what it is for */
export function promptHint(title: string): string {
  if (/^negative/i.test(title)) return "What you do not want in it";
  if (/^scene/i.test(title)) return "What happens — who, where, what they do";
  if (/^panel/i.test(title)) return "What the panel shows, and what is said";
  if (/^brief/i.test(title)) return "What this should be about";
  return "What you want to see";
}

export const kindWord = (from: string) => KIND_WORD[from.split(".").pop()?.toLowerCase() ?? ""] ?? "Document";

/** A clipping on a board: a picture as itself, a passage in reading type, a
 *  whole document folded to its first lines — each with where it came from. */
function ClipBody({ node }: { node: GraphNode }) {
  const what = String(node.data.what);
  const from = String(node.data.from || "");
  const page = Number(node.data.page) || 0;
  if (what === "picture") {
    const ratio = Math.min(2, Math.max(0.4, Number(node.data.ratio) || 1));
    const url = thumbFor(node.asset, 512);
    return (
      <div className="node-body clip-picture">
        <div className="clip-img" style={{ aspectRatio: `1 / ${ratio}` }}>
          {url && <img className="node-img" src={url} alt="" draggable={false} />}
        </div>
        <div className="clip-foot px" title={from}>
          <Tagged node={node} />
          {node.title}
        </div>
      </div>
    );
  }
  const text = String(node.data.text ?? "");
  if (what === "document") {
    const pages = Number(node.data.pages) || 0;
    const words = countWords(text.replaceAll("\f", " "));
    const first = plain((text.split("\f").find((p) => p.trim()) ?? "").replace(/^!\[[^\]]*\]\([^)]*\)$/gm, ""))
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(0, 4)
      .join(" ");
    return (
      <div className="node-body clip-doc">
        <p className="clip-kind px">
          {kindWord(from)}
          {pages ? ` · ${pages} ${pages === 1 ? "page" : "pages"}` : ""}
          {words ? ` · ${fmtCount(words)} words` : ""}
        </p>
        <p className="clip-first">{first || "No words in it."}</p>
        <div className="clip-foot px" title={from}>
          <Tagged node={node} />
          {from}
        </div>
      </div>
    );
  }
  return (
    <div className="node-body clip-passage">
      <p className="clip-words">{plain(text).trim()}</p>
      <div className="clip-foot px" title={from}>
        <Tagged node={node} />
        {page ? `p. ${page} · ` : ""}
        {from}
      </div>
    </div>
  );
}

/** a clipping's tags, before the rest of its line */
const Tagged = ({ node }: { node: GraphNode }) => (node.tags?.length ? <span className="clip-tags">{node.tags.map((t) => `#${t}`).join(" ")} · </span> : null);

/** A board on the field: what it holds at a glance — its pictures in a
 *  mosaic, else the names of its documents — and how much there is. */
function BoardBody({ node }: { node: GraphNode }) {
  // (the graph whole: a selector must return the same thing for the same state)
  const g = graph.use();
  const clips = childrenOf(g, node.id)
    .map((id) => g.nodes[id])
    .filter((n) => n.kind === "clip");
  const pics = clips.filter((c) => c.data.what === "picture" && c.asset).slice(0, 6);
  const docs = clips.filter((c) => c.data.what === "document");
  return (
    <div className="node-body board-body">
      {pics.length ? (
        <div className={`board-mosaic n${Math.min(pics.length, 6)}`}>
          {pics.map((c) => {
            const url = thumbFor(c.asset, 256);
            return <span key={c.id}>{url && <img src={url} alt="" draggable={false} />}</span>;
          })}
        </div>
      ) : docs.length ? (
        <ul className="board-docs">
          {docs.slice(0, 4).map((d) => (
            <li key={d.id}>{d.title}</li>
          ))}
        </ul>
      ) : (
        <div className="stack-none">Empty. Enter it and drop documents and pictures on it.</div>
      )}
      <div className="sheet-foot px">
        <span>{clips.length ? `${clips.length} ${clips.length === 1 ? "clipping" : "clippings"}${docs.length ? ` · ${docs.length} ${docs.length === 1 ? "document" : "documents"}` : ""}` : ""}</span>
      </div>
    </div>
  );
}

/** A take is chosen with a click and pulled out with a drag: out past a
 *  few pixels it follows the pointer as a small print, and let go on the
 *  field it becomes a card of its own there. */
function pullOut(e: ReactPointerEvent, ref: string, url: string | undefined, click: () => void) {
  e.stopPropagation();
  if (e.button !== 0) return;
  const from = { x: e.clientX, y: e.clientY };
  let ghost: HTMLImageElement | null = null;
  const move = (ev: PointerEvent) => {
    if (!ghost && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 6) return;
    if (!ghost) {
      ghost = document.createElement("img");
      ghost.className = "take-ghost";
      if (url) ghost.src = url;
      document.body.appendChild(ghost);
    }
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
    const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(".k-character, .k-location");
    document.querySelectorAll(".node.takes-look").forEach((el) => el !== under && el.classList.remove("takes-look"));
    if (under?.classList.contains("node")) under.classList.add("takes-look");
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (!ghost) return click();
    ghost.remove();
    document.querySelectorAll(".node.takes-look").forEach((el) => el.classList.remove("takes-look"));
    const over = document.elementFromPoint(ev.clientX, ev.clientY);
    const card = over?.closest<HTMLElement>("[data-node]");
    // on a character or a place: its picture; on the field: a card of its own
    if (card && (card.classList.contains("k-character") || card.classList.contains("k-location") || card.classList.contains("k-object"))) giveLook(card.dataset.node!, ref);
    else if (over?.closest(".stage") && !card) setOnField(ref, toWorld(camera.get(), { x: ev.clientX, y: ev.clientY }));
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
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
 *  summary, then its contents the way a book lists them: the pages its
 *  words lay out into (D1: pages are a layout, never cards), how each
 *  opens, where it falls; and the count. Enter it to write. */
const SHOWN = 5;
function ChapterBody({ node }: { node: GraphNode }) {
  const j = jobs.use();
  const partial = partialFor(j, node.id);
  const text = String(node.data.text ?? "") + (partial ? `\n\n${partial}` : "");
  const pages = useMemo(() => (text.trim() ? paginate(text) : []), [text]);
  const words = countWords(text);
  const summary = String(node.data.summary ?? "");
  return (
    <div className="node-body node-stack">
      {summary && <p className="stack-line selectable">{summary}</p>}
      {pages.length ? (
        <ol className="toc">
          {pages.slice(0, SHOWN).map((p, i) => (
            <li key={i} className="toc-row">
              <span className="toc-what">
                <b>Page {i + 1}</b>
                <span>{plain(p).trim().split("\n")[0] || "…"}</span>
              </span>
              <span className="toc-n px">{i + 1}</span>
            </li>
          ))}
          {pages.length > SHOWN && <li className="toc-more">and {pages.length - SHOWN} more</li>}
        </ol>
      ) : (
        <div className="stack-none">Not begun. Enter it to write.</div>
      )}
      <div className="sheet-foot px">
        <span>{partial !== undefined ? "writing…" : pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"} · ${fmtCount(words)} words` : ""}</span>
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

