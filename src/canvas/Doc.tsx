import { useEffect, useRef, type ReactNode } from "react";
import {
  Icon, PlusIcon, CheckIcon, CloseIcon, ImageIcon, ModelIcon, TextIcon, GenerateIcon, CharacterIcon, LocationIcon, StyleIcon, WriteIcon, PageIcon, ChapterIcon, NoteIcon, ShotIcon, ChevronRightIcon, ChevronLeftIcon,
  type IconSvgElement,
} from "../icons";
import { shots, proposalsFor, keepShot, keepAll, dropShot, dismiss } from "../state/shots";
import { KINDS, type NodeKind } from "../graph/kinds";
import { graph, updateData, rename, childrenOf, makeNode, addNode, takeOutput, type GraphNode } from "../state/graph";
import { drafts, draftsFor, accept, reject, cancel, proseKey } from "../state/drafts";
import { urlFor, assets } from "../state/assets";
import { enter, step, sibling, siblings } from "../state/nav";
import { tiedTo, tie, untie, held, holdBeat, askToTie, type Tied } from "../state/anchors";
import { fitAll } from "./view";
import { doc } from "../state/doc";
import { jobs, enqueue, jobFor, partialFor, RUNNABLE } from "../state/jobs";
import { FieldRow } from "../shell/Fields";
import { useMentions } from "./mentions";
import { useState } from "react";

export const GLYPH: Record<NodeKind, IconSvgElement> = {
  model: ModelIcon, prompt: TextIcon, generate: GenerateIcon, preview: ImageIcon,
  character: CharacterIcon, location: LocationIcon, style: StyleIcon, write: WriteIcon, page: PageIcon, note: NoteIcon, shot: ShotIcon, chapter: ChapterIcon,
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
  const ties = tiedTo(g, id);
  const written = String(node.data[proseKey(node.kind)] ?? "");
  const words = written.trim() ? written.trim().split(/\s+/).length : 0;

  const addNote = () => addNode(makeNode("note", 60 + kids.length * 260, 60, { parent: id, title: node.kind === "prompt" ? `Beat ${kids.length + 1}` : "Note" }));

  return (
    <div className="docpage" onPointerDown={(e) => e.stopPropagation()}>
      <article className={`paper k-${node.kind}`}>
        <header className="paper-head">
          <p className="paper-meta">
            <span className="dot" />
            <span>{def.title}</span>
            <span className="sep">·</span>
            <span>in {parent}</span>
            {node.status !== "canon" && <><span className="sep">·</span><span>{node.status}</span></>}
            {words > 0 && <><span className="sep">·</span><span>{words.toLocaleString("en-US")} words</span></>}
            {kids.length > 0 && <><span className="sep">·</span><span>{kids.length} inside</span></>}
            {images.length > 0 && <><span className="sep">·</span><span>{images.length} {images.length === 1 ? "image" : "images"}</span></>}
            {job && <><span className="sep">·</span><span>{job.state === "running" ? `running ${job.note ?? ""}` : job.state}</span></>}
            {RUNNABLE.has(node.kind) && (
              <button className="pill pill-sm paper-run" onClick={() => enqueue([id])} title="Run this one — ⌘↩">
                Run
              </button>
            )}
          </p>
          <input className="paper-title" value={node.title} onChange={(e) => rename(id, e.target.value)} spellCheck={false} aria-label="Title" placeholder="Untitled" />
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
                {d.state === "thinking" && (
                  <button className="pill-icon sm" aria-label="Stop" title="Stop" onClick={() => cancel(d.id)}>
                    <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
                  </button>
                )}
              </div>
              {d.state === "ready" && <p className="draft-text selectable">{d.text}</p>}
              {d.state === "thinking" && d.text && <p className="draft-text writing">{d.text}</p>}
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

        {node.kind === "page" && <Turn node={node} />}

        <footer className="paper-below">
          <Section
            name={node.kind === "prompt" ? "Beats" : "Notes"}
            note={kids.length ? (node.kind === "prompt" ? "In order. Each opens as its own page." : "Each opens as its own page.") : undefined}
            action={
              <button className="pill-icon sm" aria-label={node.kind === "prompt" ? "Add a beat" : "Add a note"} title={node.kind === "prompt" ? "A beat" : "A note"} onClick={addNote}>
                <Icon icon={PlusIcon} size={12} strokeWidth={2.4} />
              </button>
            }
          >
            {kids.length > 0 && (
              <ol className="beats">
                {kids.map((k, i) => (
                  <Beat key={k.id} node={k} n={i + 1} tie={ties.find((t) => t.node.id === k.id)} />
                ))}
              </ol>
            )}
          </Section>

          <Section name="Media" note={images.length ? undefined : "Drop an image anywhere on this page."}>
            {images.length > 0 && (
              <div className="media">
                {images.map((ref, i) => {
                  const url = urlFor(ref);
                  return <div key={`${i}:${ref}`} className="media-img well">{url && <img src={url} alt="" draggable={false} />}</div>;
                })}
              </div>
            )}
          </Section>
        </footer>
      </article>
    </div>
  );
}

/** The turn of a page: the one before, the one after — or a new one, when
 *  this is the last. The invitation to keep going. */
function Turn({ node }: { node: GraphNode }) {
  const g = graph.use();
  const prev = sibling(-1);
  const next = sibling(1);
  const n = siblings().length;
  const go = (dir: 1 | -1) => step(dir, () => requestAnimationFrame(fitAll));
  const newPage = () => {
    const pages = childrenOf(g, node.parent).map((id) => g.nodes[id]).filter((p) => p.kind === "page");
    const last = pages.reduce<GraphNode | undefined>((m, p) => (!m || p.x > m.x ? p : m), undefined);
    const page = makeNode("page", last ? last.x + last.w + 40 : 60, last ? last.y : 60, { parent: node.parent, title: `Page ${pages.length + 1}` });
    addNode(page);
    enter(page.id, () => requestAnimationFrame(fitAll));
  };
  return (
    <nav className="paper-turn" aria-label="Pages">
      {prev ? (
        <button className="turn" onClick={() => go(-1)}>
          <Icon icon={ChevronLeftIcon} size={12} strokeWidth={2.2} />
          {g.nodes[prev].title}
        </button>
      ) : <span />}
      <span className="turn-n px">{n > 1 ? `${siblings().indexOf(node.id) + 1} of ${n}` : ""}</span>
      {next ? (
        <button className="turn" onClick={() => go(1)}>
          {g.nodes[next].title}
          <Icon icon={ChevronRightIcon} size={12} strokeWidth={2.2} />
        </button>
      ) : (
        <button className="turn" onClick={newPage} title="A new page after this one">
          <Icon icon={PlusIcon} size={12} strokeWidth={2.4} />
          New page
        </button>
      )}
    </nav>
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

/** A child on the page: a numbered row you write in, and can open. If it
 *  came from a passage, it says so, and lights the passage under the
 *  pointer; if the passage has gone, it says that instead. */
function Beat({ node, n, tie }: { node: GraphNode; n: number; tie?: Tied }) {
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
  const adrift = !!tie && !tie.found;
  return (
    <li
      className={`beat${node.kind === "shot" ? " is-shot" : ""}${adrift ? " adrift" : ""}`}
      onPointerEnter={() => tie && holdBeat(node.id)}
      onPointerLeave={() => tie && holdBeat(null)}
    >
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
        {tie && (
          <span className="beat-tie px">
            {tie.found ? (
              <>
                <span className="beat-tie-word">{tie.found.loose ? "from a passage, edited since" : "from the words"}</span>
                <button className="beat-tie-act" onClick={() => untie(node.id)} title="Let it go; it keeps its words">
                  untie
                </button>
              </>
            ) : (
              <>
                <span className="beat-tie-word">adrift — “{tie.anchor.text.slice(0, 40)}{tie.anchor.text.length > 40 ? "…" : ""}” is not in these words</span>
                <button className="beat-tie-act" onClick={() => askToTie(node.id)} title="Choose a passage above, and it is tied again">
                  re-tie
                </button>
                <button className="beat-tie-act" onClick={() => untie(node.id)}>
                  untie
                </button>
              </>
            )}
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
    case "location":
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
                {outs.slice(-8).map((ref, i) => {
                  const url = urlFor(ref);
                  const on = node.asset === ref;
                  return (
                    <button key={`${i}:${ref}`} className={`contact-take${on ? " on" : ""}`} role="radio" aria-checked={on} onClick={() => !on && takeOutput(node.id, ref)}>
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

export function Prose({ node, field = "text", focus = true }: { node: GraphNode; field?: string; focus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const j = jobs.use();
  const g = graph.use();
  const partial = node.kind === "page" ? partialFor(j, node.id) : undefined;
  const value = partial ?? String(node.data[field] ?? "");
  const set = (v: string) => updateData(node.id, { [field]: v });
  const m = useMentions(ref, value, set, GLYPH);
  const [sel, setSel] = useState<{ text: string; at: number } | null>(null);
  const lit = held.use((h) => h.beat);
  const tying = held.use((h) => h.tying);
  // the passages that beats are tied to, where they are in the words now
  const ties = field === "text" ? tiedTo(g, node.id) : [];
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [value]);
  const read = () => {
    const el = ref.current;
    if (!el) return;
    const has = el.selectionStart !== el.selectionEnd;
    setSel(has ? { text: value.slice(el.selectionStart, el.selectionEnd).trim(), at: el.selectionStart } : null);
    m.onSelect();
  };
  const beatFromSelection = () => {
    if (!sel) return;
    const n = childrenOf(graph.get(), node.id).length;
    const title = sel.text.split(/[.!?\n]/)[0].slice(0, 40).trim() || `Beat ${n + 1}`;
    addNode(
      makeNode("note", 60 + n * 260, 60, {
        parent: node.id,
        title,
        data: { text: sel.text },
        anchor: { node: node.id, text: sel.text, at: sel.at },
      }),
    );
    setSel(null);
  };
  /** tie the beat that asked to whatever is selected now */
  const tieHere = (id: string) => {
    if (!sel) return;
    tie(id, node.id, sel.text, sel.at);
    setSel(null);
  };
  // a beat asked to be re-tied: the next passage chosen is its
  useEffect(() => {
    if (tying && sel) {
      tieHere(tying);
      askToTie(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tying, sel]);
  // the page opens with the caret in the words, at the end — nothing to click first
  useEffect(() => {
    const el = ref.current;
    if (!el || !focus) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [node.id, focus]);
  return (
    <div className="prose-wrap">
      {/* under the words, in the same metrics: where each tied passage sits */}
      <div className="prose-marks" aria-hidden>
        {marks(value, ties, lit)}
      </div>
      <textarea
        ref={ref}
        className={`prose selectable${partial !== undefined ? " arriving" : ""}`}
        readOnly={partial !== undefined}
        value={value}
        placeholder={node.kind === "page" ? "Start writing…" : "Write it the way you would say it. @ names a character, a style, a shot. Expand it from the bar when it is enough."}
        onChange={(e) => (set(e.target.value), requestAnimationFrame(m.afterChange))}
        onKeyDown={m.onKeyDown}
        onSelect={read}
        onBlur={() => setTimeout(() => (m.close(), setSel(null)), 150)}
        spellCheck
      />
      {m.menu}
      {sel && (
        <button className="pill pill-sm prose-act" onMouseDown={(e) => e.preventDefault()} onClick={beatFromSelection} title="A beat from the selected words, tied to them">
          <Icon icon={PlusIcon} size={11} strokeWidth={2.4} />
          {node.kind === "prompt" ? "Beat from selection" : "Note from selection"}
        </button>
      )}
    </div>
  );
}

/** the words again, in the same metrics, with the tied passages marked */
function marks(text: string, ties: Tied[], lit: string | null) {
  const found = ties.filter((t) => t.found).sort((a, b) => a.found!.start - b.found!.start);
  const out: ReactNode[] = [];
  let at = 0;
  found.forEach((t, i) => {
    const { start, end, loose } = t.found!;
    if (start < at) return; // ties that overlap: the first one holds
    if (start > at) out.push(text.slice(at, start));
    out.push(
      <mark key={t.node.id} className={`tie${loose ? " loose" : ""}${lit === t.node.id ? " lit" : ""}`} data-i={i}>
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  out.push(`${text.slice(at)}\n`);
  return out;
}
