import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Icon, CloseIcon, PlusIcon, GenerateIcon, CheckIcon, ChevronRightIcon, BoardIcon } from "../icons";
import { graph, updateData, type GraphNode } from "../state/graph";
import { jobs, jobFor } from "../state/jobs";
import { assets, thumbFor } from "../state/assets";
import { enter } from "../state/nav";
import { ui } from "../state/ui";
import { SHOTS, TAKES, recipeOf, makeRecipe, generateLook, chooseLook, untouched, addRefs, removeRef, refsOf, picturesOfNode, referenceable, type Shot, type Ref } from "../state/looks";
import { useMentions } from "./mentions";
import { KINDS, type NodeKind } from "../graph/kinds";
import { GLYPH } from "./Doc";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const initials = (s: string) =>
  s
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/**
 * A character opened (the studio, 2026-09-25): their face large, the
 * takes beside it to choose from, what they are called and how they look,
 * where the book names them — and the recipe that makes their picture,
 * with its references and its shot. The card's colour and wells, at the
 * size of a page.
 */
export function CharacterStudio({ node, children }: { node: GraphNode; children?: React.ReactNode }) {
  assets.use();
  const g = graph.use();
  const j = jobs.use();
  const [shot, setShot] = useState<Shot>("portrait");
  const recipe = recipeOf(g, node.id, shot);
  const job = recipe ? jobFor(j, recipe.gen.id) : undefined;
  const going = !!job && (job.state === "queued" || job.state === "running");
  const takes = [...(recipe?.gen.outputs ?? [])].reverse();
  const chosen = shot === "portrait" ? node.asset : String(node.data.sheet ?? "") || undefined;
  const name = String(node.data.name || node.title);
  const set = (patch: Record<string, string>) => updateData(node.id, patch);

  return (
    <div className="studio">
      <div className={`studio-top shot-${shot}`}>
        <section className={`studio-look shot-${shot}`}>
          <div className={`studio-face${chosen ? " has" : ""}`}>
            {chosen ? <img src={thumbFor(chosen, 1024)} alt={`${name}, ${SHOTS[shot].word.toLowerCase()}`} draggable={false} /> : shot === "portrait" ? <span className="studio-initials">{initials(name)}</span> : <span className="studio-none">{node.asset ? "No sheet yet. Generate draws the whole figure from every side — from their face." : "No sheet yet. Generate draws the whole figure from every side; give them a face first and it is drawn from that."}</span>}
            {going && <span className="studio-busy px">{job!.state === "running" ? `drawing ${Math.round((job!.progress ?? 0) * 100)}%` : "waiting"}</span>}
          </div>
          {(takes.length > 0 || going) && (
            <div className="studio-takes" aria-label="Takes">
              {going && Array.from({ length: TAKES }, (_, i) => <div key={`w${i}`} className="studio-take waiting" />)}
              {takes.map((t, i) => (
                <button
                  key={`${i}:${t}`}
                  className={`studio-take${i === takes.indexOf(chosen ?? "") ? " on" : ""}`}
                  onClick={() => chooseLook(node.id, shot, t)}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/doodle-ref", JSON.stringify({ picture: t }))}
                  title={t === chosen ? (shot === "portrait" ? "Their face" : "Their sheet") : shot === "portrait" ? "Make this their face" : "Make this their sheet"}
                  aria-pressed={t === chosen}
                >
                  <img src={thumbFor(t, 256)} alt="" draggable={false} />
                  {i === takes.indexOf(chosen ?? "") && (
                    <span className="studio-kept">
                      <Icon icon={CheckIcon} size={10} strokeWidth={2.6} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="studio-facts">
          <label className="studio-field">
            <span className="lbl">Name</span>
            <input className="inp studio-name" value={String(node.data.name ?? "")} placeholder="What the book calls them" onChange={(e) => set({ name: e.target.value })} spellCheck={false} />
          </label>
          <label className="studio-field grow">
            <span className="lbl">Appearance</span>
            <textarea className="inp" rows={5} value={String(node.data.description ?? "")} placeholder="Age, face, build, what they wear — what a picture of them must get right" onChange={(e) => set({ description: e.target.value })} spellCheck />
          </label>
          {children}
          <RecipeCard node={node} shot={shot} setShot={setShot} going={going} />
        </section>
      </div>
    </div>
  );
}

/** The recipe: the shot, what the appearance already says, what is added, the references, Generate. */
function RecipeCard({ node, shot, setShot, going }: { node: GraphNode; shot: Shot; setShot: (s: Shot) => void; going: boolean }) {
  const g = graph.use();
  const drawWith = ui.use((u) => u.drawWith);
  const recipe = recipeOf(g, node.id, shot);
  const name = String(node.data.name || node.title);
  const value = recipe ? String(recipe.prompt.data.text ?? "") : SHOTS[shot].line(name || "them");
  const box = useRef<HTMLTextAreaElement>(null);
  // the recipe grows with its words
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  const [picking, setPicking] = useState(false);
  const [over, setOver] = useState(false);
  const write = (text: string) => {
    const r = recipe ?? makeRecipe(node.id, shot);
    if (r) updateData(r.prompt.id, { text });
  };
  const mention = useMentions(box, value, write, GLYPH as Record<NodeKind, never>);
  const refs = recipe ? refsOf(recipe.gen) : [];
  const withRefs = (add: Ref[]) => {
    const r = recipe ?? makeRecipe(node.id, shot);
    if (r) addRefs(r.gen.id, add);
  };
  const onDrop = (e: DragEvent) => {
    setOver(false);
    const raw = e.dataTransfer.getData("text/doodle-ref");
    if (!raw) return;
    e.preventDefault();
    try {
      withRefs([JSON.parse(raw) as Ref]);
    } catch {
      /* not one of ours */
    }
  };
  const synced = recipe ? untouched(node, recipe, shot) : true;
  const appearance = String(node.data.description ?? "").trim();

  return (
    <section
      className={`recipe card${over ? " over" : ""}`}
      aria-label="Recipe"
      data-recipe={recipe?.gen.id ?? ""}
      data-node-recipe={node.id}
      data-shot={shot}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/doodle-ref")) (e.preventDefault(), setOver(true));
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className="recipe-head">
        <Icon icon={GenerateIcon} size={13} strokeWidth={2} />
        <span className="recipe-title">Recipe</span>
        <div className="seg paper-form recipe-shot" role="radiogroup" aria-label="Shot">
          {(Object.keys(SHOTS) as Shot[]).map((s) => (
            <button key={s} className={`seg-btn${s === shot ? " on" : ""}`} role="radio" aria-checked={s === shot} onClick={() => setShot(s)} title={SHOTS[s].note}>
              {SHOTS[s].word}
            </button>
          ))}
        </div>
      </div>

      <p className="recipe-from">
        <span className="recipe-from-lbl px">With their appearance</span>
        <span className="recipe-from-text">{appearance || "— nothing yet; write it above, and it rides into every picture."}</span>
      </p>

      <div className="recipe-prompt">
        <textarea
          ref={box}
          className="inp"
          rows={3}
          value={value}
          aria-label="Recipe"
          placeholder="What the picture should be — @ names a board, a style, someone, somewhere"
          onChange={(e) => (write(e.target.value), mention.afterChange())}
          onKeyDown={mention.onKeyDown}
          onSelect={mention.onSelect}
          onBlur={() => mention.close()}
          spellCheck
        />
        {mention.menu}
        {recipe && !synced && (
          <button className="pill pill-sm recipe-reset" onClick={() => write(SHOTS[shot].line(name))} title="Back to what the shot says by itself">
            As the shot says
          </button>
        )}
      </div>

      <div className="recipe-refs">
        <span className="recipe-lbl px">References</span>
        {refs.map((r, i) => (
          <RefChip key={i} r={r} onRemove={() => recipe && removeRef(recipe.gen.id, r)} />
        ))}
        {node.asset && shot === "sheet" && <span className="ref-chip auto" title="Their face rides with every picture of them">
          <img src={thumbFor(node.asset, 256)} alt="" />
          Their face
        </span>}
        <button className="pill pill-sm" onClick={() => setPicking(true)} aria-label="Add a reference" title="Pictures from the project, or a board as a moodboard — or drop one here">
          <Icon icon={PlusIcon} size={11} strokeWidth={2.4} />
          Add
        </button>
      </div>

      <div className="recipe-foot">
        {recipe && (
          <button className="pill pill-sm" onClick={() => enter(recipe.gen.id)} title="Its seed, steps, frame and model — the generator inside">
            Settings
            <Icon icon={ChevronRightIcon} size={11} strokeWidth={2.2} />
          </button>
        )}
        <span className="recipe-note">
          {drawWith === "codex" ? `${TAKES} pictures on your ChatGPT` : drawWith === "mock" ? `${TAKES} with the stand-in` : `${TAKES} candidates`}
          {" · "}
          {SHOTS[shot].frame}
        </span>
        <button className="recipe-go" disabled={going} onClick={() => generateLook(node.id, shot)}>
          <Icon icon={GenerateIcon} size={14} strokeWidth={2.1} />
          {going ? "Drawing…" : node.asset && shot === "portrait" ? "Generate again" : "Generate"}
        </button>
      </div>

      {picking && <RefPicker exclude={node.id} have={refs} onAdd={(r) => withRefs([r])} onClose={() => setPicking(false)} />}
    </section>
  );
}

function RefChip({ r, onRemove }: { r: Ref; onRemove: () => void }) {
  const g = graph.get();
  const n = "node" in r ? g.nodes[r.node] : undefined;
  const pics = n ? picturesOfNode(n, g, 3) : "picture" in r ? [r.picture] : [];
  const label = n ? (n.kind === "board" ? `${n.title} · mood` : n.title) : "A picture";
  return (
    <span className={`ref-chip${n?.kind === "board" ? " board" : ""}`}>
      <span className="ref-thumbs">
        {pics.slice(0, 3).map((p) => (
          <img key={p} src={thumbFor(p, 256)} alt="" />
        ))}
        {!pics.length && <Icon icon={BoardIcon} size={12} strokeWidth={2} />}
      </span>
      <span className="ref-word">{label}</span>
      <button className="ref-x" onClick={onRemove} aria-label={`Remove ${label}`}>
        <Icon icon={CloseIcon} size={10} strokeWidth={2.4} />
      </button>
    </span>
  );
}

/** Every picture in the project, by where it is — a board as a whole, as a moodboard. */
function RefPicker({ exclude, have, onAdd, onClose }: { exclude: string; have: Ref[]; onAdd: (r: Ref) => void; onClose: () => void }) {
  const g = graph.use();
  assets.use();
  const all = useMemo(() => referenceable(g, exclude), [g, exclude]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const has = (r: Ref) => have.some((x) => ("node" in x && "node" in r && x.node === r.node) || ("picture" in x && "picture" in r && x.picture === r.picture));
  const Tile = ({ r, pic, word, sub }: { r: Ref; pic?: string; word: string; sub?: string }) => (
    <button className={`pick-tile${has(r) ? " on" : ""}`} onClick={() => onAdd(r)} disabled={has(r)} title={has(r) ? "Already a reference" : `Add ${word}`}>
      <span className="pick-img">{pic && <img src={thumbFor(pic, 256)} alt="" draggable={false} />}</span>
      <span className="pick-word">{word}</span>
      {sub && <span className="pick-sub px">{sub}</span>}
    </button>
  );
  const groups: [string, React.ReactNode[]][] = [
    ["Boards — as a moodboard", all.boards.map((b) => <Tile key={b.id} r={{ node: b.id }} pic={picturesOfNode(b, g)[0]} word={b.title} sub={plural(picturesOfNode(b, g, 99).length, "picture")} />)],
    ["People, places, things", all.people.map((n) => <Tile key={n.id} r={{ node: n.id }} pic={n.asset} word={n.title} sub={KINDS[n.kind].title} />)],
    ["Styles", all.styles.map((n) => <Tile key={n.id} r={{ node: n.id }} pic={n.attachments![0]} word={n.title} sub={plural(n.attachments!.length, "reference")} />)],
    ["Clippings", all.clips.map((n) => <Tile key={n.id} r={{ picture: n.asset! }} pic={n.asset} word={n.title} />)],
    ["Takes", all.takes.map(({ from, picture }) => <Tile key={picture} r={{ picture }} pic={picture} word={from.title} />)],
    ["Media", all.media.map(({ from, picture }) => <Tile key={`${from.id}:${picture}`} r={{ picture }} pic={picture} word={from.title} />)],
  ];
  const any = groups.some(([, t]) => t.length);
  return (
    <div className="pick-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pick card" role="dialog" aria-label="Add a reference">
        <div className="pick-head">
          <span className="pick-title">Add a reference</span>
          <span className="pick-note">Pictures ride with the recipe; a board lends its mood.</span>
          <button className="pill-icon" onClick={onClose} aria-label="Done" title="Done — esc">
            <Icon icon={CloseIcon} size={13} strokeWidth={2.2} />
          </button>
        </div>
        <div className="pick-body">
          {!any && <p className="pick-none">No pictures in the project yet. Drop some on a board, give someone a face, or drop a picture on the recipe.</p>}
          {groups
            .filter(([, t]) => t.length)
            .map(([name, tiles]) => (
              <section key={name} className="pick-group">
                <h3 className="pick-of">{name}</h3>
                <div className="pick-grid">{tiles}</div>
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
