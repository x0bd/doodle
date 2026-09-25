import { useEffect, useRef, type ReactNode } from "react";
import {
  Icon, PlusIcon, CheckIcon, CloseIcon, ImageIcon, ModelIcon, TextIcon, GenerateIcon, CharacterIcon, LocationIcon, ObjectIcon, StyleIcon, WriteIcon, PageIcon, ChapterIcon, NoteIcon, CommentIcon, ShotIcon, BoardIcon, ClipIcon, GroupIcon, ChevronRightIcon, ChevronLeftIcon,
  type IconSvgElement,
} from "../icons";
import { shots, proposalsFor, keepShot, keepAll, dropShot, dismiss } from "../state/shots";
import { ideas, ideasFor, keepIdea, keepAllIdeas, dropIdea, dismissIdeas } from "../state/ideas";
import { KINDS, type NodeKind } from "../graph/kinds";
import { graph, updateData, rename, childrenOf, makeNode, addNode, takeOutput, type GraphNode } from "../state/graph";
import { ui } from "../state/ui";
import { saveSoon } from "../state/doc";
import { reveal } from "../state/reveal";
import { picked, addComment } from "../state/comments";
import { learned, ignored, lexicon, knows, learn, ignore } from "../state/lexicon";
import { Margin } from "./Margin";
import { drafts, draftsFor, accept, reject, cancel, proseKey } from "../state/drafts";
import { urlFor, thumbFor, assets } from "../state/assets";
import { enter, step, sibling, siblings } from "../state/nav";
import { tiedTo, tie, untie, held, holdBeat, askToTie, type Tied } from "../state/anchors";
import { fitAll } from "./view";
import { doc } from "../state/doc";
import { jobs, enqueue, jobFor, partialFor, RUNNABLE } from "../state/jobs";
import { FieldRow } from "../shell/Fields";
import { mentionables } from "./mentions";
import { appearances } from "../state/appears";
import { CharacterStudio } from "./Studio";

/** the kinds that open into a studio of their own (2026-09-25: the character first) */
export const STUDIO = new Set<NodeKind>(["character"]);
import { illustrate, illustrationsOf, briefOf, takeIntoWords } from "../state/illustrate";
import { useState, useMemo } from "react";
import { Editor, type Picked, type Tie } from "../writer/Editor";
import { formOf, countWords, plain, figureLine } from "../writer/markup";

export const GLYPH: Record<NodeKind, IconSvgElement> = {
  model: ModelIcon, prompt: TextIcon, generate: GenerateIcon, preview: ImageIcon,
  character: CharacterIcon, location: LocationIcon, object: ObjectIcon, style: StyleIcon, write: WriteIcon, page: PageIcon, note: NoteIcon, shot: ShotIcon, chapter: ChapterIcon, comment: CommentIcon,
  board: BoardIcon, clip: ClipIcon, group: GroupIcon,
};

/** how long a screenplay runs: a page a minute, some 180 words a page */
const runtime = (words: number) => {
  const s = Math.round((words / 180) * 60);
  return s < 60 ? `≈ ${Math.max(5, Math.round(s / 5) * 5)} s` : `≈ ${Math.round(s / 60)} min`;
};

const IDEA_WORD: Record<string, string> = { beat: "beats", note: "notes", character: "characters", location: "places", object: "things", comment: "comments", bible: "additions to the bible", illustration: "illustrations" };

const ASK_LABEL = { expand: "Expanded", continue: "Continued", rewrite: "Rewritten", ask: "Answered" } as const;

/** A node entered is a document: its own page, one idiom for every kind.
 *  The head names it; the sections are what it is; what it holds — notes,
 *  beats, media — are lists on the page, not cards on a field. */
export function Doc({ id }: { id: string }) {
  const g = graph.use();
  const node = g.nodes[id];
  const all = drafts.use();
  const proposals = shots.use();
  const offers = ideas.use();
  const j = jobs.use();
  assets.use();
  const name = doc.use((d) => d.name);
  if (!node) return null;
  const def = KINDS[node.kind];
  const inside = childrenOf(g, id).map((c) => g.nodes[c]).sort((a, b) => a.seq - b.seq);
  // beats and notes are written in the list; anything else inside (a brief,
  // a writer, a generator) is a row that opens it
  const kids = inside.filter((k) => k.kind === "note" || k.kind === "shot");
  // an illustration (its brief and its generator) is shown with its takes, not as a row
  const drawn = illustrationsOf(g, id);
  const others = inside.filter((k) => k.kind !== "note" && k.kind !== "shot" && k.kind !== "comment" && !k.data.illustrates && !drawn.some((d) => d.data.illustrates === k.id));
  const images = node.attachments ?? [];
  // a chapter or page in prose takes pictures into its words, as figures
  const prosed = (node.kind === "chapter" || node.kind === "page") && formOf(node.data) === "prose";
  const mine = draftsFor(all, id);
  const proposed = proposalsFor(proposals, id);
  const offered = ideasFor(offers, id);
  const parent = node.parent ? g.nodes[node.parent]?.title : name;
  const job = RUNNABLE.has(node.kind) ? jobFor(j, id) : undefined;
  const ties = tiedTo(g, id);
  const written = String(node.data[proseKey(node.kind)] ?? "");
  const form = formOf(node.data);
  const words = countWords(written, form);
  const writes = proseKey(node.kind) === "text";

  const addNote = () => addNode(makeNode("note", 60 + kids.length * 260, 60, { parent: id, title: node.kind === "prompt" ? `Beat ${kids.length + 1}` : "Note" }));

  return (
    <div className="docpage" onPointerDown={(e) => e.stopPropagation()}>
      <article className={`paper k-${node.kind}${STUDIO.has(node.kind) ? " studio-paper" : ""}`}>
        <header className="paper-head">
          <p className="paper-meta">
            <span className="dot" />
            <span>{def.title}</span>
            <span className="sep">·</span>
            <span>in {parent}</span>
            {node.status !== "canon" && <><span className="sep">·</span><span>{node.status}</span></>}
            {words > 0 && <><span className="sep">·</span><span>{words.toLocaleString("en-US")} words</span></>}
            {form === "screenplay" && words > 0 && <><span className="sep">·</span><span title="A screenplay page runs about a minute">{runtime(words)}</span></>}
            {kids.length > 0 && <><span className="sep">·</span><span>{kids.length} inside</span></>}
            {images.length > 0 && <><span className="sep">·</span><span>{images.length} {images.length === 1 ? "image" : "images"}</span></>}
            {job && <><span className="sep">·</span><span>{job.state === "running" ? `running ${job.note ?? ""}` : job.state}</span></>}
            {writes && (
              <span className="seg paper-form" role="radiogroup" aria-label="Form">
                {(["prose", "screenplay"] as const).map((f) => (
                  <button key={f} className={`seg-btn${form === f ? " on" : ""}`} role="radio" aria-checked={form === f} onClick={() => updateData(id, { form: f })}>
                    {f === "prose" ? "Prose" : "Screenplay"}
                  </button>
                ))}
              </span>
            )}
            {RUNNABLE.has(node.kind) && (
              <button className="pill pill-sm paper-run" onClick={() => enqueue([id])} title="Run this one — ⌘↩">
                Run
              </button>
            )}
          </p>
          <input className="paper-title" value={node.title} onChange={(e) => rename(id, e.target.value)} spellCheck={false} aria-label="Title" placeholder="Untitled" />
          {/* built from the board (M3.6): the clippings it came from, a key away */}
          {String(node.data.clips ?? "")
            .split(",")
            .filter((c) => g.nodes[c]).length > 0 && (
            <p className="paper-clips">
              <span>From the board</span>
              {String(node.data.clips)
                .split(",")
                .map((c) => g.nodes[c])
                .filter(Boolean)
                .map((c) => (
                  <button key={c.id} className="built-clip" onClick={() => enter(c.id)} title="Open the clipping">
                    {c.title}
                  </button>
                ))}
            </p>
          )}
        </header>

        <Body node={node} />

        {mine.map((d) => (
            <section key={d.id} className={`draft ${d.state}`} aria-live="polite">
              <div className="draft-head">
                <span className="lbl">
                  {d.state === "thinking" ? `${d.provider ?? "Thinking"}${d.doing ? ` · ${d.doing}` : ""}…` : d.state === "failed" ? "Could not" : d.reply ? `${d.provider ?? "The agent"} answered` : `${ASK_LABEL[d.ask]} — a draft${d.provider ? ` · ${d.provider}` : ""}`}
                </span>
                {d.state === "ready" && d.reply && (
                  <button className="pill-icon sm" aria-label="Done" title="Done with it" onClick={() => reject(d.id)}>
                    <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
                  </button>
                )}
                {d.state === "ready" && !d.reply && (
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
              {d.state === "ready" && <Editor value={d.text} form={formOf(node.data)} readOnly className="draft-text selectable" />}
              {d.state === "thinking" && d.text && <p className="draft-text writing">{plain(d.text, formOf(node.data))}</p>}
              {d.state === "failed" && <p className="draft-text">{d.error}</p>}
            </section>
        ))}

        {offered.map((set) => (
          <section key={set.id} className="proposal ready" aria-live="polite">
            <div className="sec-head">
              <span className="sec-name">Proposed {IDEA_WORD[set.items[0]?.kind ?? "note"]}</span>
              <span className="sec-note">{set.items.length} from {set.by} — ghosts until you keep them</span>
              <button className="pill pill-sm" onClick={() => keepAllIdeas(set.id)}>
                <Icon icon={CheckIcon} size={11} strokeWidth={2.4} />
                Keep all
              </button>
              <button className="pill-icon sm" aria-label="Dismiss all" onClick={() => dismissIdeas(set.id)}>
                <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
              </button>
            </div>
            <ol className="ghosts">
              {set.items.map((it, i) => (
                <li key={i} className="ghost">
                  <span className="beat-n px">{i + 1}</span>
                  <div className="beat-what">
                    {it.kind !== "comment" && <span className="ghost-title">{it.title}</span>}
                    <span className="ghost-text">{it.text}</span>
                    {(it.quote || it.why) && (
                      <span className="ghost-cam px">
                        {it.quote && <>from “{it.quote.length > 80 ? `${it.quote.slice(0, 80)}…` : it.quote}”</>}
                        {it.why && <span className="ghost-why"> — {it.why}</span>}
                      </span>
                    )}
                  </div>
                  <span className="ghost-acts">
                    <button className="pill pill-sm" onClick={() => keepIdea(set.id, i)}>
                      <Icon icon={CheckIcon} size={11} strokeWidth={2.4} />
                      Keep
                    </button>
                    <button className="pill-icon sm" aria-label="Drop" onClick={() => dropIdea(set.id, i)}>
                      <Icon icon={CloseIcon} size={12} strokeWidth={2.2} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
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

        {(node.kind === "page" || node.kind === "chapter") && <Turn node={node} />}

        <footer className="paper-below">
          <Section
            name={node.kind === "prompt" || node.kind === "chapter" ? "Beats" : "Notes"}
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

          {drawn.length > 0 && (
            <Section name="Illustrations" note="Made from the words they are tied to. Put one in, and it sits after them.">
              <div className="illos">
                {drawn.map((d) => (
                  <Illustration key={d.id} host={node} gen={d} />
                ))}
              </div>
            </Section>
          )}

          {others.length > 0 && (
            <Section name="Inside" note="What works on these words. Each opens.">
              <div className="list inside">
                {others.map((k) => (
                  <button key={k.id} className="list-row inside-row" onClick={() => enter(k.id, () => requestAnimationFrame(fitAll))}>
                    <span className={`inside-glyph k-${k.kind}`}>
                      <Icon icon={GLYPH[k.kind]} size={13} strokeWidth={1.8} />
                    </span>
                    <span className="list-word">{k.title}</span>
                    <span className="inside-kind">{KINDS[k.kind].title}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section name="Media" note={images.length ? undefined : "Drop an image anywhere on this page."}>
            {images.length > 0 && (
              <div className="media">
                {images.map((ref, i) => {
                  const url = thumbFor(ref, 512);
                  return (
                    <div key={`${i}:${ref}`} className="media-img well">
                      {url && <img src={url} alt="" draggable={false} />}
                      {prosed && (
                        <button className="pill pill-sm media-in" onClick={() => intoWords(node, ref)} title="A figure at the end of the words — move it where it belongs">
                          Into the words
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </footer>
      </article>
    </div>
  );
}

/** one passage's pictures: what it was made from, how far it is, its takes */
function Illustration({ host, gen }: { host: GraphNode; gen: GraphNode }) {
  const j = jobs.use();
  assets.use();
  const job = jobFor(j, gen.id);
  const going = job && (job.state === "queued" || job.state === "running");
  const takes = gen.outputs ?? [];
  const brief = briefOf(graph.get(), gen);
  const inWords = String(host.data.text ?? "");
  return (
    <div className="illo">
      <div className="illo-head">
        <span className="illo-quote">“{String(gen.data.quote || brief?.anchor?.text || gen.title)}”</span>
        <span className="illo-state px">{going ? (job.state === "running" ? `drawing ${Math.round((job.progress ?? 0) * 100)}%` : "waiting") : job?.state === "failed" ? "could not" : `${takes.length} take${takes.length === 1 ? "" : "s"}`}</span>
        <button className="pill pill-sm" disabled={!!going} onClick={() => enqueue([gen.id])} title="More takes of it">
          Again
        </button>
        {brief && (
          <button className="pill pill-sm" onClick={() => enter(brief.id)} title="The words it was made from — change them, then Again">
            Brief
          </button>
        )}
      </div>
      {takes.length > 0 && (
        <div className="illo-takes">
          {[...takes].reverse().map((t) => {
            const url = thumbFor(t, 512);
            const placed = inWords.includes(`](${t}`);
            return (
              <div key={t} className="media-img well illo-take">
                {url && <img src={url} alt="" draggable={false} />}
                <button className="pill pill-sm media-in" disabled={placed} onClick={() => void takeIntoWords(host.id, gen.id, t)} title="A figure after the passage it illustrates">
                  {placed ? "In the words" : "Into the words"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** a picture from the page's media into its words, as a figure at their end */
function intoWords(node: GraphNode, src: string) {
  const text = String(node.data.text ?? "").trimEnd();
  updateData(node.id, { text: `${text}${text ? "\n\n" : ""}${figureLine({ src })}` });
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
    const same = childrenOf(g, node.parent).map((id) => g.nodes[id]).filter((p) => p.kind === node.kind);
    const last = same.reduce<GraphNode | undefined>((m, p) => (!m || p.x > m.x ? p : m), undefined);
    const next = makeNode(node.kind, last ? last.x + last.w + 40 : 60, last ? last.y : 60, { parent: node.parent, title: node.kind === "chapter" ? `Chapter ${same.length + 1}` : `Page ${same.length + 1}` });
    addNode(next);
    enter(next.id, () => requestAnimationFrame(fitAll));
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
        <button className="turn" onClick={newPage} title={`A new ${node.kind} after this one`}>
          <Icon icon={PlusIcon} size={12} strokeWidth={2.4} />
          New {node.kind}
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

/** what an empty field of a kind says it wants (kinds.ts `hint`) */
const hintOf = (kind: NodeKind, key: string) => {
  for (const g of KINDS[kind].groups) for (const f of g.fields) if (f.key === key && "hint" in f && f.hint) return f.hint;
  return undefined;
};

/** the chapters and pages that name them, each a key to go there */
function Appears({ node }: { node: GraphNode }) {
  const nodes = graph.use((g) => g.nodes);
  const where = useMemo(() => appearances(node, Object.values(nodes)), [node, nodes]);
  return (
    <div className="sheet-field">
      <span className="lbl">Appears in</span>
      {where.length ? (
        <span className="appears">
          {where.map((a) => (
            <button key={a.id} className="pill pill-sm" onClick={() => enter(a.id)} title={`Named ${a.count === 1 ? "once" : `${a.count} times`}`}>
              {a.title}
              <span className="appears-n px">{a.count}</span>
            </button>
          ))}
        </span>
      ) : (
        <span className="appears-none">No chapter names {KINDS[node.kind].title.toLowerCase() === "character" ? "them" : "it"} yet.</span>
      )}
    </div>
  );
}

function Body({ node }: { node: GraphNode }) {
  const def = KINDS[node.kind];
  const set = (patch: Record<string, string | number>) => updateData(node.id, patch);
  const j = jobs.use();
  switch (node.kind) {
    case "prompt":
    case "note":
    case "page":
    case "chapter":
      return <Prose node={node} />;
    case "character":
      return (
        <CharacterStudio node={node}>
          <Appears node={node} />
        </CharacterStudio>
      );
    case "location":
    case "object":
      return (
        <div className="sheet-char">
          <div className={`sheet-ref well${node.asset ? "" : " diag"}`}>
            {node.asset && <img src={thumbFor(node.asset, 512)} alt="" draggable={false} />}
            {!node.asset && <span className="sheet-ref-hint">Drop a reference</span>}
          </div>
          <div className="sheet-fields">
            <label className="sheet-field">
              <span className="lbl">Name</span>
              <input className="inp" value={String(node.data.name ?? "")} placeholder={hintOf(node.kind, "name")} onChange={(e) => set({ name: e.target.value })} spellCheck={false} />
            </label>
            <label className="sheet-field grow">
              <span className="lbl">{node.kind === "object" ? "What it is, how it looks" : node.kind === "location" ? "What it is like" : "Appearance"}</span>
              <textarea className="inp" rows={6} value={String(node.data.description ?? "")} placeholder={hintOf(node.kind, "description")} onChange={(e) => set({ description: e.target.value })} spellCheck />
            </label>
            <Appears node={node} />
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
                  const url = thumbFor(ref, 512);
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
  const j = jobs.use();
  const focusing = ui.use((u) => u.focusing);
  // a find's hit in these words: where it falls in the plain words, for the writer
  const asked = reveal.use((r) => (r && r.node === node.id && field === "text" ? r : null));
  const shown = useMemo(() => {
    if (!asked) return undefined;
    const raw = String(node.data.text ?? "");
    const form = formOf(node.data);
    const start = plain(raw.slice(0, asked.start), form).length;
    const hit = plain(raw.slice(asked.start, asked.end), form).trim();
    const words = plain(raw, form);
    // the hit, found again near where it should be in the plain words
    const at = words.indexOf(hit, Math.max(0, start - 8));
    const from = at < 0 ? start : at;
    return { start: from, end: from + hit.length, key: asked.key };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked?.key]);
  const g = graph.use();
  // a writer at work: a page shows its words as they come; a chapter shows
  // them after its own, where they will land
  const arriving = node.kind === "page" || node.kind === "chapter" ? partialFor(j, node.id) : undefined;
  const own = String(node.data[field] ?? "");
  const partial = arriving === undefined ? undefined : node.kind === "chapter" && own.trim() ? `${own.trim()}\n\n${arriving}` : arriving;
  const value = partial ?? own;
  const form = field === "text" ? formOf(node.data) : "prose";
  const set = (v: string) => updateData(node.id, { [field]: v });
  const [sel, setSel] = useState<Picked | null>(null);
  const lit = held.use((h) => h.beat);
  const tying = held.use((h) => h.tying);
  // the passages that beats and open comments are tied to, where they are in the words now
  const found = (field === "text" ? tiedTo(g, node.id) : []).filter((t) => t.found && !(t.node.kind === "comment" && t.node.data.resolved));
  const tieKey = found.map((t) => `${t.node.id}:${t.found!.start}:${t.found!.end}:${t.found!.loose}`).join("|");
  const host = useRef<HTMLDivElement>(null);
  const ties = useMemo<Tie[]>(
    () => found.map((t) => ({ id: t.node.id, start: t.found!.start, end: t.found!.end, loose: t.found!.loose, remark: t.node.kind === "comment" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tieKey],
  );
  // spelling: the Mac's checker, the book's own words left alone (M2.8)
  const spellOn = ui.use((u) => u.spell);
  const taught = learned.use();
  const passed = ignored.use();
  const words = useMemo(() => lexicon(g, taught, passed), [g, taught, passed]);
  const wordsKey = useMemo(() => [...words].sort().join(" "), [words]);
  const spell = useMemo(
    () => (spellOn && field === "text" ? { known: (w: string) => knows(words, w), learn: (w: string) => (learn(w), saveSoon()), ignore, key: wordsKey } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spellOn, field, wordsKey],
  );
  const nameKey = mentionables().map((n) => n.title).join("\u0000");
  const names = useMemo(() => (nameKey ? nameKey.split("\u0000") : []), [nameKey]);
  const beatFrom = (p: Picked) => {
    const n = childrenOf(graph.get(), node.id).length;
    const title = p.text.split(/[.!?\n]/)[0].slice(0, 40).trim() || `Beat ${n + 1}`;
    addNode(
      makeNode("note", 60 + n * 260, 60, {
        parent: node.id,
        title,
        data: { text: p.text },
        anchor: { node: node.id, text: p.text, at: p.at },
      }),
    );
    setSel(null);
  };
  // a beat asked to be re-tied: the next passage chosen is its
  useEffect(() => {
    if (tying && sel) {
      tie(tying, node.id, sel.text, sel.at);
      askToTie(null);
      setSel(null);
    }
  }, [tying, sel, node.id]);
  return (
    <div className="prose-wrap" ref={host}>
    <Editor
      value={value}
      form={form}
      onChange={set}
      readOnly={partial !== undefined}
      className={`prose selectable${partial !== undefined ? " arriving" : ""}${form === "screenplay" ? " screenplay" : ""}`}
      placeholder={
        form === "screenplay"
          ? "INT. SOMEWHERE — NIGHT"
          : node.kind === "page" || node.kind === "chapter"
            ? "Start writing…"
            : "Write it the way you would say it. @ names a character, a style, a shot. Expand it from the bar when it is enough."
      }
      focusKey={focus ? node.id : false}
      typewriter={focusing}
      reveal={shown}
      spell={spell}
      ties={ties}
      lit={lit}
      names={names}
      mentions={(q) =>
        mentionables()
          .filter((n) => n.title.toLowerCase().startsWith(q.toLowerCase()))
          .map((n) => ({ id: n.id, title: n.title, hint: n.kind, icon: <Icon icon={GLYPH[n.kind]} size={13} strokeWidth={1.8} /> }))
      }
      onPick={(p) => {
        setSel(p);
        // what Edit › Add Comment is about — kept past the blur the menu causes
        if (p && field === "text") picked.set({ node: node.id, p });
      }}
      gutter
      bubble={(p) =>
        field === "text" ? (
          <>
            <button className="wb-act" onClick={() => beatFrom(p)} title="A beat from the selected words, tied to them">
              <Icon icon={PlusIcon} size={11} strokeWidth={2.4} />
              {node.kind === "prompt" || node.kind === "chapter" ? "Beat" : "Note"}
            </button>
            <button className="wb-act" onClick={() => (addComment(node.id, p), setSel(null))} title="A comment on these words, in the margin — ⌥⌘M">
              <Icon icon={CommentIcon} size={11} strokeWidth={2.2} />
              Comment
            </button>
            {(node.kind === "chapter" || node.kind === "page") && form === "prose" && (
              <button className="wb-act" onClick={() => (illustrate(node.id, p), setSel(null))} title="A picture of these words, with who and where they name">
                <Icon icon={ImageIcon} size={11} strokeWidth={2} />
                Illustrate
              </button>
            )}
          </>
        ) : null
      }
    />
    {field === "text" && <Margin node={node} host={host} value={value} />}
    </div>
  );
}
