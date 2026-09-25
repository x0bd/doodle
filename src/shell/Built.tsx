import { Icon, CloseIcon, CheckIcon, CharacterIcon, LocationIcon, ObjectIcon, StyleIcon, ChapterIcon, BookIcon, type IconSvgElement } from "../icons";
import { graph } from "../state/graph";
import { nav, enter } from "../state/nav";
import { built, keepProposals, dropProposal, type Proposal, type ProposalKind } from "../state/build";

const HEAD: Record<ProposalKind, string> = { character: "Cast", location: "Places", thing: "Things", style: "Style", chapter: "Outline", bible: "Bible" };
const GLYPHS: Record<ProposalKind, IconSvgElement> = { character: CharacterIcon, location: LocationIcon, thing: ObjectIcon, style: StyleIcon, chapter: ChapterIcon, bible: BookIcon };
const ORDER: ProposalKind[] = ["character", "location", "thing", "style", "chapter", "bible"];

/** light the clippings a proposal came from, on the board behind */
function light(ids: string[]) {
  document.querySelectorAll(".node.from-lit").forEach((el) => el.classList.remove("from-lit"));
  for (const id of ids) document.querySelector(`[data-node="${id}"]`)?.classList.add("from-lit");
}

/**
 * What the writer proposed from a board (PLAN.md M3.6): ghosts, beside the
 * board, until kept or dropped — by kind, each with the clippings it came
 * from (pointed at, they light on the board; clicked, they open). Kept, a
 * thing becomes a node beside the board; the bible goes into the book's.
 */
export function Built() {
  const focus = nav.use((n) => n.focus);
  const set = built.use((b) => (focus ? b[focus] : undefined));
  const g = graph.use();
  if (!set || !focus) return null;
  const all = set.items;
  const groups = ORDER.map((k) => ({ k, items: all.filter((i) => i.kind === k) })).filter((x) => x.items.length);
  const names = (p: Proposal) => p.from.map((id) => g.nodes[id]).filter(Boolean);

  return (
    <aside className="built card" aria-label="From the board" onPointerLeave={() => light([])}>
      <div className="built-head">
        <span className="built-title">From the board</span>
        <span className="built-by px">{set.by}</span>
        <button className="pill pill-sm" onClick={() => keepProposals(focus, all.map((i) => i.id))} title="Keep every one">
          Keep all
        </button>
        <button className="pill-icon built-x" onClick={() => built.set((b) => ({ ...Object.fromEntries(Object.entries(b).filter(([k]) => k !== focus)) }))} aria-label="Drop them all" title="Drop them all">
          <Icon icon={CloseIcon} size={12} strokeWidth={2} />
        </button>
      </div>
      <div className="built-list">
        {groups.map(({ k, items }) => (
          <section key={k} className="built-group">
            <p className="built-of">
              <Icon icon={GLYPHS[k]} size={12} strokeWidth={1.9} />
              {HEAD[k]}
            </p>
            {items.map((p) => (
              <div key={p.id} className="built-row" onPointerEnter={() => light(p.from)}>
                <div className="built-what">
                  <b>{p.title}</b>
                  {p.kind === "bible" && p.extra ? (
                    <span className="built-text">
                      {[p.extra.tone && `Tone: ${p.extra.tone}`, p.extra.rules && `Rules: ${p.extra.rules}`, p.extra.avoid && `Avoid: ${p.extra.avoid}`].filter(Boolean).join(" · ")}
                    </span>
                  ) : (
                    <span className="built-text">
                      {p.text}
                      {p.kind === "style" && p.extra?.palette ? ` Palette: ${p.extra.palette}.` : ""}
                      {p.kind === "style" && p.extra?.lighting ? ` Light: ${p.extra.lighting}.` : ""}
                    </span>
                  )}
                  {names(p).length > 0 && (
                    <span className="built-from">
                      {names(p).map((c) => (
                        <button key={c.id} className="built-clip" onClick={() => enter(c.id)} title="Open the clipping">
                          {c.title}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
                <div className="built-keys">
                  <button className="pill-icon" onClick={() => keepProposals(focus, [p.id])} aria-label={`Keep ${p.title}`} title="Keep">
                    <Icon icon={CheckIcon} size={12} strokeWidth={2.2} />
                  </button>
                  <button className="pill-icon" onClick={() => dropProposal(focus, p.id)} aria-label={`Drop ${p.title}`} title="Drop">
                    <Icon icon={CloseIcon} size={12} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
