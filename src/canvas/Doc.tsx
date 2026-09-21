import { useEffect, useRef, type ReactNode } from "react";
import {
  Icon, PlusIcon, CheckIcon, CloseIcon, ImageIcon, ModelIcon, TextIcon, GenerateIcon, CharacterIcon, StyleIcon, WriteIcon, PageIcon, NoteIcon, ShotIcon, ChevronRightIcon,
  type IconSvgElement,
} from "../icons";
import { shots, proposalsFor, keepShot, keepAll, dropShot, dismiss } from "../state/shots";
import { KINDS, type NodeKind } from "../graph/kinds";
import { graph, updateData, rename, childrenOf, makeNode, addNode, takeOutput, type GraphNode } from "../state/graph";
import { drafts, draftsFor, accept, reject } from "../state/drafts";
import { urlFor, assets } from "../state/assets";
import { enter } from "../state/nav";
import { doc } from "../state/doc";
import { jobs, enqueue, jobFor, RUNNABLE } from "../state/jobs";
import { FieldRow } from "../shell/Fields";
import { useMentions } from "./mentions";
import { useState } from "react";

export const GLYPH: Record<NodeKind, IconSvgElement> = {
  model: ModelIcon, prompt: TextIcon, generate: GenerateIcon, preview: ImageIcon,
  character: CharacterIcon, style: StyleIcon, write: WriteIcon, page: PageIcon, note: NoteIcon, shot: ShotIcon,
};

const ASK_LABEL = { expand: "Expanded", continue: "Continued", rewrite: "Rewritten", ask: "Answered" } as const;

/** A node entered is a document: its own page, one idiom for every kind.
 *  The head names it; the sections are what it is; what it holds — notes,
 *  beats, media — are lists on the page, not cards on a field. */
export function Doc({ id }: { id: string }) {
  const g = graph.use();
  const node = g.nodes[id];
  const all = drafts.use();
  const proposals = shots.use();
  const j = jobs.use();
  assets.use();
  const name = doc.use((d) => d.name);
  if (!node) return null;
  const def = KINDS[node.kind];
  const kids = childrenOf(g, id).map((c) => g.nodes[c]).sort((a, b) => a.seq - b.seq);
  const images = node.attachments ?? [];
  const mine = draftsFor(all, id);
  const proposed = proposalsFor(proposals, id);
  const parent = node.parent ? g.nodes[node.parent]?.title : name;
  const job = RUNNABLE.has(node.kind) ? jobFor(j, id) : undefined;

  const addNote = () => addNode(makeNode("note", 60 + kids.length * 260, 60, { parent: id, title: node.kind === "prompt" ? `Beat ${kids.length + 1}` : "Note" }));

  return (
    <div className="docpage" onPointerDown={(e) => e.stopPropagation()}>
      <article className="paper">
        <header className="paper-head">
          <span className={`paper-glyph k-${node.kind}`}>
            <Icon icon={GLYPH[node.kind]} size={18} strokeWidth={1.7} />
          </span>
          <div className="paper-name">
            <input className="paper-title" value={node.title} onChange={(e) => rename(id, e.target.value)} spellCheck={false} aria-label="Title" />
            <p className="paper-meta">
              {def.title} · in {parent}
              {node.status !== "canon" && ` · ${node.status}`}
              {kids.length > 0 && ` · ${kids.length} inside`}
              {images.length > 0 && ` · ${images.length} ${images.length === 1 ? "image" : "images"}`}
              {job && ` · ${job.state === "running" ? `running ${job.note ?? ""}` : job.state}`}
            </p>
          </div>
          {RUNNABLE.has(node.kind) && (
            <button className="pill pill-ink" onClick={() => enqueue([id])} title="Run this one — ⌘↩">
              Run
            </button>
          )}
        </header>

        <Body node={node} />

        {mine.map((d) => (
            <section key={d.id} className={`draft ${d.state}`} aria-live="polite">
              <div className="draft-head">
                <span className="lbl">
                  {d.state === "thinking" ? `${d.provider ?? "Thinking"}…` : d.state === "failed" ? "Could not" : `${ASK_LABEL[d.ask]} — a draft${d.provider ? ` · ${d.provider}` : ""}`}
                </span>
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

        {proposed.map((p) => (
          <section key={p.id} className={`proposal ${p.state}`} aria-live="polite">
            <div className="sec-head">
              <span className="sec-name">Proposed shots</span>
              <span className="sec-note">
                {p.state === "thinking" ? `${p.provider ?? "Thinking"}…` : p.state === "failed" ? p.error : `${p.items.length} from ${p.provider ?? "the agent"} — ghosts until you keep them`}
              </span>
              {p.state === "ready" && (
                <>
                  <button className="pill pill-sm" onClick={() => keepAll(p.id)}>
                    <Icon icon={CheckIcon} size={11} strokeWidth={2.4} />
                    Keep all
                  </button>
                  <button className="pill-icon sm" aria-label="Dismiss all" onClick={() => dismiss(p.id)}>
                    <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
                  </button>
                </>
              )}
              {p.state === "failed" && (
                <button className="pill-icon sm" aria-label="Dismiss" onClick={() => dismiss(p.id)}>
                  <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
                </button>
              )}
            </div>
            {p.state === "ready" && (
              <ol className="ghosts">
                {p.items.map((it, i) => (
                  <li key={i} className="ghost">
                    <span className="beat-n px">{i + 1}</span>
                    <div className="beat-what">
                      <span className="ghost-title">{it.title}</span>
                      <span className="ghost-text">{it.description}</span>
                      <span className="ghost-cam px">
                        {it.shotSize} · {it.lensMm}mm · {it.movement} · {(it.durationMs / 1000).toFixed(1)}s
                        {it.rationale && <span className="ghost-why"> — {it.rationale}</span>}
                      </span>
                    </div>
                    <span className="ghost-acts">
                      <button className="pill pill-sm" onClick={() => keepShot(p.id, i)}>
                        <Icon icon={CheckIcon} size={11} strokeWidth={2.4} />
                        Keep
                      </button>
                      <button className="pill-icon sm" aria-label="Drop" onClick={() => dropShot(p.id, i)}>
                        <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}

        <Section
          name={node.kind === "prompt" ? "Beats and shots" : "Notes"}
          note={node.kind === "prompt" ? "The scene in order. Each opens as its own page." : "Kept with it. Each opens as its own page."}
          action={
            <button className="pill pill-sm" onClick={addNote}>
              <Icon icon={PlusIcon} size={11} strokeWidth={2.4} />
              {node.kind === "prompt" ? "Beat" : "Note"}
            </button>
          }
        >
          {kids.length === 0 ? (
            <p className="sec-empty">Nothing yet.</p>
          ) : (
            <ol className="beats">
              {kids.map((k, i) => (
                <Beat key={k.id} node={k} n={i + 1} />
              ))}
            </ol>
          )}
        </Section>

        <Section name="Media" note="Drop images anywhere on this page.">
          {images.length === 0 ? (
            <div className="media-empty diag">
              <Icon icon={ImageIcon} size={16} strokeWidth={1.6} />
              <span>No images yet</span>
            </div>
          ) : (
            <div className="media">
              {images.map((ref) => {
                const url = urlFor(ref);
                return <div key={ref} className="media-img well">{url && <img src={url} alt="" draggable={false} />}</div>;
              })}
            </div>
          )}
        </Section>
      </article>
    </div>
  );
}

function Section({ name, note, action, children }: { name: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <span className="sec-name">{name}</span>
        {note && <span className="sec-note">{note}</span>}
        {action}
      </div>
      {children}
    </section>
  );
}

/** A child on the page: a numbered row you write in, and can open. */
function Beat({ node, n }: { node: GraphNode; n: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, [node.data.text, node.data.description]);
  const open = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    enter(node.id, undefined, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };
  const key = node.kind === "shot" ? "description" : "text";
  return (
    <li className={`beat${node.kind === "shot" ? " is-shot" : ""}`}>
      <span className="beat-n px">{node.kind === "shot" ? <Icon icon={ShotIcon} size={12} strokeWidth={1.8} /> : n}</span>
      <div className="beat-what">
        <input className="beat-title" value={node.title} onChange={(e) => rename(node.id, e.target.value)} spellCheck={false} aria-label="Title" />
        <textarea
          ref={ref}
          className="beat-text"
          rows={1}
          value={String(node.data[key] ?? "")}
          placeholder={node.kind === "shot" ? "What the camera sees" : "Write it here"}
          onChange={(e) => updateData(node.id, { [key]: e.target.value })}
          spellCheck
        />
        {node.kind === "shot" && (
          <span className="ghost-cam px">
            {String(node.data.shotSize)} · {String(node.data.lensMm)}mm · {String(node.data.movement)} · {(Number(node.data.durationMs) / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      <button className="pill-icon sm beat-open" aria-label="Open" title="Open as its own page" onClick={open}>
        <Icon icon={ChevronRightIcon} size={13} strokeWidth={2} />
      </button>
    </li>
  );
}

/* ── what each kind is, as sections ── */

function Body({ node }: { node: GraphNode }) {
  const def = KINDS[node.kind];
  const set = (patch: Record<string, string | number>) => updateData(node.id, patch);
  const j = jobs.use();
  switch (node.kind) {
    case "prompt":
    case "note":
    case "page":
      return <Prose node={node} />;
    case "character":
      return (
        <div className="sheet-char">
          <div className={`sheet-ref well${node.asset ? "" : " diag"}`}>
            {node.asset && <img src={urlFor(node.asset)} alt="" draggable={false} />}
            {!node.asset && <span className="sheet-ref-hint">Drop a reference</span>}
          </div>
          <div className="sheet-fields">
            <label className="sheet-field">
              <span className="lbl">Name</span>
              <input className="inp" value={String(node.data.name ?? "")} onChange={(e) => set({ name: e.target.value })} spellCheck={false} />
            </label>
            <label className="sheet-field grow">
              <span className="lbl">Appearance</span>
              <textarea className="inp" rows={6} value={String(node.data.description ?? "")} onChange={(e) => set({ description: e.target.value })} spellCheck />
            </label>
          </div>
        </div>
      );
    case "style": {
      const swatches = String(node.data.palette ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return (
        <div className="sheet-fields">
          <label className="sheet-field">
            <span className="lbl">The look</span>
            <textarea className="inp" rows={3} value={String(node.data.description ?? "")} onChange={(e) => set({ description: e.target.value })} spellCheck />
          </label>
          <div className="sheet-two">
            <label className="sheet-field">
              <span className="lbl">Palette</span>
              <input className="inp" value={String(node.data.palette ?? "")} onChange={(e) => set({ palette: e.target.value })} spellCheck={false} placeholder="Ink, brass, sodium orange" />
              {swatches.length > 0 && (
                <span className="swatches">
                  {swatches.map((w) => (
                    <span key={w} className="chip">{w}</span>
                  ))}
                </span>
              )}
            </label>
            <label className="sheet-field">
              <span className="lbl">Lighting</span>
              <input className="inp" value={String(node.data.lighting ?? "")} onChange={(e) => set({ lighting: e.target.value })} spellCheck={false} placeholder="One source, long shadows" />
            </label>
          </div>
        </div>
      );
    }
    case "preview":
      return (
        <div className="sheet-print well">
          {node.asset ? <img src={urlFor(node.asset)} alt="" draggable={false} /> : <span className="sheet-ref-hint">Nothing yet. Run the graph.</span>}
        </div>
      );
    case "generate": {
      const outs = node.outputs ?? [];
      const runs = [...j.order].reverse().map((id) => j.jobs[id]).filter((x) => x.nodeId === node.id && x.state === "completed");
      return (
        <>
          {outs.length > 0 && (
            <Section name="Takes" note="What came out. The ringed one goes on.">
              <div className="contact" role="radiogroup" aria-label="Takes">
                {outs.slice(-8).map((ref) => {
                  const url = urlFor(ref);
                  const on = node.asset === ref;
                  return (
                    <button key={ref} className={`contact-take${on ? " on" : ""}`} role="radio" aria-checked={on} onClick={() => !on && takeOutput(node.id, ref)}>
                      {url && <img src={url} alt="" draggable={false} />}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}
          {def.groups.map((grp) => (
            <Section key={grp.name} name={grp.name}>
              <div className="group">
                {grp.fields.map((f) => (
                  <FieldRow key={f.key} node={node} field={f} />
                ))}
              </div>
            </Section>
          ))}
          {runs.length > 0 && (
            <Section name="Runs">
              <div className="list">
                {runs.slice(0, 6).map((r) => (
                  <div key={r.id} className="list-row runrow">
                    <span className="list-word">
                      {"seed" in r.request ? `seed ${r.request.seed}` : "text"}{(r.count ?? 1) > 1 ? ` · ${r.count} candidates` : ""}
                    </span>
                    <span className="list-key">{r.startedAt && r.endedAt ? `${((r.endedAt - r.startedAt) / 1000).toFixed(1)}s` : ""}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      );
    }
    case "write":
      return (
        <>
          {node.data.output ? (
            <p className="prose-read selectable">{String(node.data.output)}</p>
          ) : (
            <p className="sec-empty">Nothing written yet. Run it.</p>
          )}
          {def.groups.map((grp) => (
            <Section key={grp.name} name={grp.name}>
              <div className="group">
                {grp.fields.map((f) => (
                  <FieldRow key={f.key} node={node} field={f} />
                ))}
              </div>
            </Section>
          ))}
        </>
      );
    case "shot":
      return (
        <>
          <Prose node={node} field="description" />
          <Section name="Camera">
            <div className="group">
              {def.groups[0].fields.filter((f) => f.key !== "description").map((f) => (
                <FieldRow key={f.key} node={node} field={f} />
              ))}
            </div>
          </Section>
        </>
      );
    case "model":
      return (
        <Section name={def.groups[0].name}>
          <div className="group">
            {def.groups[0].fields.map((f) => (
              <FieldRow key={f.key} node={node} field={f} />
            ))}
          </div>
        </Section>
      );
  }
}

function Prose({ node, field = "text" }: { node: GraphNode; field?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const value = String(node.data[field] ?? "");
  const set = (v: string) => updateData(node.id, { [field]: v });
  const m = useMentions(ref, value, set, GLYPH);
  const [sel, setSel] = useState<string>("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [value]);
  const read = () => {
    const el = ref.current;
    if (!el) return;
    setSel(el.selectionStart !== el.selectionEnd ? value.slice(el.selectionStart, el.selectionEnd).trim() : "");
    m.onSelect();
  };
  const beatFromSelection = () => {
    const g = graph.get();
    const n = childrenOf(g, node.id).length;
    const title = sel.split(/[.!?\n]/)[0].slice(0, 40).trim() || `Beat ${n + 1}`;
    addNode(makeNode("note", 60 + n * 260, 60, { parent: node.id, title, data: { text: sel } }));
    setSel("");
  };
  return (
    <div className="prose-wrap">
      <textarea
        ref={ref}
        className="prose selectable"
        value={value}
        placeholder={node.kind === "page" ? "Nothing written yet. Wire a writer in and run, or write here." : "Write it the way you would say it. @ names a character, a style, a shot. Expand it from the bar when it is enough."}
        onChange={(e) => (set(e.target.value), requestAnimationFrame(m.afterChange))}
        onKeyDown={m.onKeyDown}
        onSelect={read}
        onBlur={() => setTimeout(() => (m.close(), setSel("")), 150)}
        spellCheck
      />
      {m.menu}
      {sel && node.kind === "prompt" && (
        <button className="pill pill-sm prose-act" onMouseDown={(e) => e.preventDefault()} onClick={beatFromSelection} title="A beat from the selected words">
          <Icon icon={PlusIcon} size={11} strokeWidth={2.4} />
          Beat from selection
        </button>
      )}
    </div>
  );
}
