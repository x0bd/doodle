import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Icon, CloseIcon, CheckIcon, CommentIcon } from "../icons";
import { graph, childrenOf, updateData, type GraphNode } from "../state/graph";
import { holdBeat } from "../state/anchors";
import { editing, resolveComment, removeComment, showResolved } from "../state/comments";
import { ui } from "../state/ui";

/** what the margin needs beside the column before comments stand in it */
const ROOM = 268;
const GAP = 8;

/**
 * The comments on a writer's words (PLAN.md M2.7), in the margin beside the
 * passage each is about — the Pages / Word idiom in The Soft Machine's
 * terms: a card each, level with its words, stacked so none covers
 * another; where the window leaves no margin, a small mark at the column's
 * edge that opens the card. A comment whose words are gone waits at the
 * foot, *adrift*. Resolved ones are put away (shown, faded, on asking).
 */
export function Margin({ node, host, value }: { node: GraphNode; host: RefObject<HTMLDivElement | null>; value: string }) {
  const g = graph.use();
  const all = childrenOf(g, node.id)
    .map((id) => g.nodes[id])
    .filter((c) => c.kind === "comment");
  const shownResolved = showResolved.use();
  const list = all.filter((c) => shownResolved || !c.data.resolved);
  const resolved = all.length - all.filter((c) => !c.data.resolved).length;
  const want = editing.use();
  const [tops, setTops] = useState<Record<string, number>>({});
  const [wide, setWide] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const cards = useRef<Record<string, HTMLDivElement | null>>({});
  const key = list.map((c) => `${c.id}:${c.data.resolved}:${String(c.data.text).length}`).join("|");

  // Level with its words, then pushed down so none covers the one above.
  // The writer draws a new passage's mark a moment after the comment exists,
  // so a first pass places only what it can find; the pass a frame later
  // (`settled`) is the one that calls a comment with no mark adrift. A card
  // with no place yet is not shown, so nothing slides in from the foot.
  const layout = (settled = true) => {
    const h = host.current;
    if (!h) return;
    const box = h.getBoundingClientRect();
    // the room is to the next thing beside the column: the Inspector, if it is out
    const pane = document.querySelector<HTMLElement>(".win.ins-on .pane.right");
    const edge = pane ? pane.getBoundingClientRect().left : window.innerWidth;
    setWide(edge - box.right >= ROOM);
    const at = list
      .map((c) => {
        const el = h.querySelector(`[data-tie="${c.id}"]`);
        return { id: c.id, top: el ? el.getBoundingClientRect().top - box.top : settled ? Infinity : NaN };
      })
      .filter((a) => !Number.isNaN(a.top));
    at.sort((a, b) => a.top - b.top);
    const next: Record<string, number> = {};
    let floor = 0;
    let foot = Math.max(0, box.height - 40);
    for (const a of at) {
      const top = Number.isFinite(a.top) ? Math.max(a.top, floor) : Math.max(foot, floor);
      next[a.id] = top;
      floor = top + (cards.current[a.id]?.offsetHeight ?? 64) + GAP;
      if (!Number.isFinite(a.top)) foot = floor;
    }
    setTops(next);
  };
  useLayoutEffect(() => {
    layout(false);
    const f = requestAnimationFrame(() => layout(true));
    return () => cancelAnimationFrame(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key]);
  useEffect(() => {
    const h = host.current;
    if (!h) return;
    const again = () => layout();
    const ro = new ResizeObserver(again);
    ro.observe(h);
    window.addEventListener("resize", again);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // the panes coming and going move the column without resizing it: look again once they have
  const panes = ui.use((u) => `${u.navigator}${u.inspector}${u.focusing}`);
  useEffect(() => {
    const t = setTimeout(layout, 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes]);
  // an open comment (narrow margin) closes on a click anywhere else
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !(e.target as HTMLElement).closest(".margin") && setOpen(null);
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [open]);
  // a comment just made opens where it can be written
  useEffect(() => {
    if (want && list.some((c) => c.id === want) && !wide) setOpen(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, wide]);

  if (!all.length) return null;
  const card = (c: GraphNode, style?: React.CSSProperties) => (
    <Remark key={c.id} c={c} style={style} placed={tops[c.id] !== undefined} set={(el) => (cards.current[c.id] = el)} adrift={!host.current?.querySelector(`[data-tie="${c.id}"]`)} />
  );
  return (
    <div className={`margin${wide ? "" : " narrow"}`} aria-label="Comments">
      {wide
        ? list.map((c) => card(c, tops[c.id] === undefined ? { visibility: "hidden" } : { top: tops[c.id] }))
        : list.map((c) => (
            <div key={c.id} className="margin-mark-at" style={tops[c.id] === undefined ? { visibility: "hidden" } : { top: tops[c.id] }}>
              <button className={`margin-mark${open === c.id ? " on" : ""}`} onClick={() => setOpen((o) => (o === c.id ? null : c.id))} onPointerEnter={() => holdBeat(c.id)} onPointerLeave={() => holdBeat(null)} aria-label="A comment">
                <Icon icon={CommentIcon} size={12} strokeWidth={2} />
              </button>
              {open === c.id && card(c)}
            </div>
          ))}
      {resolved > 0 && (
        <button className="margin-resolved" onClick={() => showResolved.set(!shownResolved)}>
          {shownResolved ? "Hide resolved" : `${resolved} resolved`}
        </button>
      )}
    </div>
  );
}

function Remark({ c, style, set, adrift, placed }: { c: GraphNode; style?: React.CSSProperties; set: (el: HTMLDivElement | null) => void; adrift: boolean; placed: boolean }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const want = editing.use();
  // a comment just made takes the caret — once it stands where it belongs
  useEffect(() => {
    if (want === c.id && placed) {
      box.current?.focus();
      editing.set(null);
    }
  }, [want, c.id, placed]);
  const done = !!c.data.resolved;
  return (
    <div ref={set} className={`comment-card${done ? " done" : ""}`} style={style} onPointerEnter={() => holdBeat(c.id)} onPointerLeave={() => holdBeat(null)}>
      {adrift && <p className="remark-adrift">Its words are gone from here.</p>}
      <textarea
        ref={box}
        className="remark-text"
        value={String(c.data.text ?? "")}
        onChange={(e) => updateData(c.id, { text: e.target.value })}
        placeholder="A comment on these words"
        rows={1}
        spellCheck
      />
      <div className="remark-foot">
        <span className="remark-on" title={c.anchor?.text}>
          “{(c.anchor?.text ?? "").slice(0, 28)}
          {(c.anchor?.text.length ?? 0) > 28 ? "…" : ""}”
        </span>
        <button className="pill-icon remark-key" onClick={() => resolveComment(c.id, !done)} aria-label={done ? "Reopen" : "Resolve"} title={done ? "Reopen" : "Resolve — put it away"}>
          <Icon icon={CheckIcon} size={12} strokeWidth={2.2} />
        </button>
        <button className="pill-icon remark-key" onClick={() => removeComment(c.id)} aria-label="Delete the comment" title="Delete">
          <Icon icon={CloseIcon} size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
