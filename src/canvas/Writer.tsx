import { useEffect, useRef } from "react";
import { Icon, PlusIcon, CheckIcon, CloseIcon, NoteIcon, ImageIcon } from "../icons";
import { KINDS } from "../graph/kinds";
import { graph, updateData, rename, childrenOf, makeNode, addNode } from "../state/graph";
import { drafts, draftsFor, accept, reject } from "../state/drafts";
import { urlFor, assets } from "../state/assets";
import { enter } from "../state/nav";
import { doc } from "../state/doc";

export const WRITER_KINDS = new Set(["prompt", "note", "page"]);

const ASK_LABEL = { expand: "Expanded", continue: "Continued", rewrite: "Rewritten", ask: "Answered" } as const;

/** The writer: a text node entered is a page, not a field. Write on it;
 *  what it carries — notes, images — sits beneath as context; what the
 *  agent proposes waits below the text until it is taken. */
export function Writer({ id }: { id: string }) {
  const g = graph.use();
  const node = g.nodes[id];
  const all = drafts.use();
  assets.use();
  const name = doc.use((d) => d.name);
  const body = useRef<HTMLTextAreaElement>(null);

  // the body grows with what is in it
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.max(160, el.scrollHeight)}px`;
  }, [node?.data.text]);

  if (!node) return null;
  const def = KINDS[node.kind];
  const notes = childrenOf(g, id).map((c) => g.nodes[c]);
  const images = node.attachments ?? [];
  const mine = draftsFor(all, id);
  const parent = node.parent ? g.nodes[node.parent]?.title : name;

  const addNote = () => {
    const n = makeNode("note", 60 + notes.length * 260, 60, { parent: id });
    addNode(n);
  };

  return (
    <div className="writer" onPointerDown={(e) => e.stopPropagation()}>
      <article className="paper">
        <input className="paper-title" value={node.title} onChange={(e) => rename(id, e.target.value)} spellCheck={false} aria-label="Title" />
        <p className="paper-meta">
          {def.title} · in {parent}
          {notes.length > 0 && ` · ${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
          {images.length > 0 && ` · ${images.length} ${images.length === 1 ? "image" : "images"}`}
        </p>
        <textarea
          ref={body}
          className="paper-body selectable"
          value={String(node.data.text ?? "")}
          placeholder={node.kind === "page" ? "Nothing written yet. Wire a writer in and run, or write here." : "Write it the way you would say it. The agent can expand it from here."}
          onChange={(e) => updateData(id, { text: e.target.value })}
          spellCheck
        />

        {mine.map((d) => (
          <section key={d.id} className={`draft ${d.state}`} aria-live="polite">
            <div className="draft-head">
              <span className="lbl">{d.state === "thinking" ? "Thinking…" : d.state === "failed" ? "Could not" : `${ASK_LABEL[d.ask]} — a draft`}</span>
              {d.state === "ready" && (
                <span className="draft-acts">
                  <button className="pill pill-sm" onClick={() => accept(d.id)}>
                    <Icon icon={CheckIcon} size={11} strokeWidth={2.4} />
                    {d.ask === "rewrite" ? "Replace" : "Keep"}
                  </button>
                  <button className="pill-icon sm" aria-label="Discard" onClick={() => reject(d.id)}>
                    <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
                  </button>
                </span>
              )}
              {d.state === "failed" && (
                <button className="pill-icon sm" aria-label="Dismiss" onClick={() => reject(d.id)}>
                  <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
                </button>
              )}
            </div>
            {d.state === "ready" && <p className="draft-text selectable">{d.text}</p>}
            {d.state === "failed" && <p className="draft-text">{d.error}</p>}
          </section>
        ))}

        <section className="ctx">
          <div className="ctx-head">
            <span className="ctx-name">Context</span>
            <span className="ctx-note">What this carries with it — notes, references, images. Drop images here.</span>
            <button className="pill pill-sm" onClick={addNote}>
              <Icon icon={PlusIcon} size={11} strokeWidth={2.4} />
              Note
            </button>
          </div>
          <div className="ctx-grid">
            {notes.map((n) => (
              <button key={n.id} className="ctx-card" onDoubleClick={() => enter(n.id)} title="Double-click to open">
                <span className="ctx-card-head">
                  <Icon icon={NoteIcon} size={12} strokeWidth={1.8} />
                  <span className="ctx-card-title">{n.title}</span>
                </span>
                <span className="ctx-card-text">{String(n.data.text || "Empty")}</span>
              </button>
            ))}
            {images.map((ref) => {
              const url = urlFor(ref);
              return (
                <div key={ref} className="ctx-img well">
                  {url ? <img src={url} alt="" draggable={false} /> : <span className="ctx-img-wait" />}
                </div>
              );
            })}
            {notes.length === 0 && images.length === 0 && (
              <div className="ctx-empty diag">
                <Icon icon={ImageIcon} size={16} strokeWidth={1.6} />
                <span>Nothing attached yet</span>
              </div>
            )}
          </div>
        </section>
      </article>
    </div>
  );
}
