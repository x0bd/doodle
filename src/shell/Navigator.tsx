import { useEffect, useRef, useState, type DragEvent } from "react";
import { Icon, PlusIcon, ChevronRightIcon, BookIcon } from "../icons";
import { graph, select, makeNode, addNode, childrenOf, rename, reorder, type GraphNode, type GraphState } from "../state/graph";
import { nav, enter, riseTo, trail } from "../state/nav";
import { fitAll, screenRect } from "../canvas/view";
import { fitRect } from "../canvas/camera";
import { doc } from "../state/doc";
import { GLYPH } from "../canvas/Doc";

/** where a drop would land on a row */
type Drop = { id: string; where: "before" | "after" | "into" } | null;

const kids = (g: GraphState, id: string | null) =>
  childrenOf(g, id).map((c) => g.nodes[c]).sort((a, b) => a.seq - b.seq);

/** The left pane: the whole document as a tree — the book, its chapters,
 *  their pages, what the pages hold — the way an outliner shows a scene.
 *  Click goes there; double-click enters; drag reorders and re-homes;
 *  click a chosen row again to rename it. */
export function Navigator() {
  const g = graph.use();
  const name = doc.use((d) => d.name);
  const focus = nav.use((n) => n.focus);
  const path = trail();
  // what is unfolded: the root and the way down to here, always; the rest as left
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setOpen((o) => {
      const next = new Set(o);
      for (const id of path) next.add(id);
      return next.size === o.size ? o : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [drop, setDrop] = useState<Drop>(null);
  const [editing, setEditing] = useState<string | null>(null);

  /** go to a node: its level shown, it selected and framed */
  const go = (n: GraphNode) => {
    if (n.parent !== focus) riseTo(n.parent, () => requestAnimationFrame(fitAll));
    select([n.id]);
    requestAnimationFrame(() => fitRect(graph.get().nodes[n.id], screenRect(), 200));
  };
  const into = (id: string) => enter(id, () => requestAnimationFrame(fitAll), { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const home = () => riseTo(null, () => requestAnimationFrame(fitAll), { x: window.innerWidth / 2, y: window.innerHeight / 2 });

  /** add under what is chosen — a page in a chapter, a note in a page, else here */
  const add = () => {
    const chosen = g.selection.length === 1 ? g.nodes[g.selection[0]] : undefined;
    const parent = chosen && (chosen.kind === "chapter" || chosen.kind === "page" || chosen.kind === "prompt") ? chosen : focus ? g.nodes[focus] : undefined;
    const under = parent?.id ?? null;
    const there = kids(g, under);
    const last = there.reduce<GraphNode | undefined>((m, s) => (!m || s.x + s.w > m.x + m.w ? s : m), undefined);
    const kind = !parent ? "chapter" : parent.kind === "chapter" ? "page" : parent.kind === "prompt" ? "note" : "note";
    const n = there.filter((s) => s.kind === kind).length + 1;
    const title = kind === "page" ? `Page ${n}` : kind === "chapter" ? `Chapter ${n}` : parent?.kind === "prompt" ? `Beat ${n}` : `Note ${n}`;
    const node = makeNode(kind, last ? last.x + last.w + 40 : 60, last ? last.y : 60, { parent: under, title });
    addNode(node);
    if (parent) setOpen((o) => new Set(o).add(parent.id));
    select([node.id]);
  };

  // drag: a row picked up; over another, the third of it says before / into / after
  const dragging = useRef<string | null>(null);
  const onDragStart = (e: DragEvent, id: string) => {
    dragging.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onDragOver = (e: DragEvent, id: string) => {
    if (!dragging.current || dragging.current === id) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientY - r.top) / r.height;
    const where = t < 0.3 ? "before" : t > 0.7 ? "after" : "into";
    setDrop((d) => (d && d.id === id && d.where === where ? d : { id, where }));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const id = dragging.current;
    dragging.current = null;
    const d = drop;
    setDrop(null);
    if (!id || !d) return;
    const target = g.nodes[d.id];
    if (!target) return;
    if (d.where === "into") {
      reorder(id, target.id, null);
      setOpen((o) => new Set(o).add(target.id));
    } else if (d.where === "before") {
      reorder(id, target.parent, target.id);
    } else {
      const after = kids(g, target.parent);
      const i = after.findIndex((s) => s.id === target.id);
      const next = after.slice(i + 1).find((s) => s.id !== id);
      reorder(id, target.parent, next?.id ?? null);
    }
  };
  const onDragEnd = () => {
    dragging.current = null;
    setDrop(null);
  };

  /** every row on screen, in the order they are drawn — what the arrows walk */
  const flat = (parent: string | null): GraphNode[] =>
    kids(g, parent).flatMap((n) => [n, ...(open.has(n.id) ? flat(n.id) : [])]);

  /** the arrows walk the tree; left folds or goes up; right unfolds or goes
   *  in; ⌘↑ and ⌘↓ move a row among its siblings; ⏎ enters; F2 renames */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const rows = flat(null);
    if (!rows.length) return;
    const here = g.selection.length === 1 ? rows.findIndex((n) => n.id === g.selection[0]) : -1;
    const n = here >= 0 ? rows[here] : undefined;
    const step = (to: number) => {
      const t = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (t) go(t);
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (e.metaKey && n) {
          const sib = kids(g, n.parent);
          const i = sib.findIndex((s) => s.id === n.id);
          const after = sib[i + 2];
          if (sib[i + 1]) reorder(n.id, n.parent, after?.id ?? null);
        } else step(here + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (e.metaKey && n) {
          const sib = kids(g, n.parent);
          const i = sib.findIndex((s) => s.id === n.id);
          if (i > 0) reorder(n.id, n.parent, sib[i - 1].id);
        } else step(here < 0 ? 0 : here - 1);
        break;
      case "ArrowRight":
        if (!n) return;
        e.preventDefault();
        if (childrenOf(g, n.id).length && !open.has(n.id)) toggle(n.id);
        else if (childrenOf(g, n.id).length) step(here + 1);
        break;
      case "ArrowLeft": {
        if (!n) return;
        e.preventDefault();
        if (open.has(n.id)) toggle(n.id);
        else if (n.parent && g.nodes[n.parent]) go(g.nodes[n.parent]);
        break;
      }
      case "Enter":
        if (!n) return;
        e.preventDefault();
        into(n.id);
        break;
      case "F2":
        if (!n) return;
        e.preventDefault();
        setEditing(n.id);
        break;
    }
  };

  /** one row, then its children while it is open */
  const rows = (parent: string | null, depth: number): React.ReactNode[] =>
    kids(g, parent).flatMap((n) => {
      const inside = childrenOf(g, n.id).length;
      const isOpen = open.has(n.id);
      const chosen = g.selection.includes(n.id);
      const d = drop?.id === n.id ? drop.where : null;
      return [
        <div
          key={n.id}
          className={`tree-row list-row${focus === n.id ? " on" : ""}${chosen ? " hl" : ""}${d ? ` drop-${d}` : ""}${n.status === "rejected" ? " off" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable={editing !== n.id}
          onDragStart={(e) => onDragStart(e, n.id)}
          onDragOver={(e) => onDragOver(e, n.id)}
          onDragLeave={() => setDrop((x) => (x?.id === n.id ? null : x))}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onClick={(e) => {
            if (editing === n.id) return;
            if (chosen && !e.metaKey && !e.shiftKey) setEditing(n.id);
            else go(n);
          }}
          onDoubleClick={() => editing !== n.id && into(n.id)}
          role="treeitem"
          aria-selected={chosen}
          aria-expanded={inside ? isOpen : undefined}
          aria-level={depth + 1}
        >
          <span
            className={`tree-twist${inside ? "" : " none"}${isOpen ? " open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (inside) toggle(n.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-hidden
          >
            {inside > 0 && <Icon icon={ChevronRightIcon} size={11} strokeWidth={2.2} />}
          </span>
          <span className={`row-glyph k-${n.kind}`}>
            <Icon icon={GLYPH[n.kind]} size={12} strokeWidth={1.9} />
          </span>
          {editing === n.id ? (
            <Name node={n} onDone={() => setEditing(null)} />
          ) : (
            <span className="list-word">{n.title}</span>
          )}
          {inside > 0 && !isOpen && <span className="tree-n px">{inside}</span>}
        </div>,
        ...(isOpen ? rows(n.id, depth + 1) : []),
      ];
    });

  return (
    <aside className="pane left card" aria-label="Outline">
      <div className="pane-head">
        <span className="pane-title">Outline</span>
        <button className="pill-icon sm" aria-label="Add" title="Add under what is chosen" onClick={add}>
          <Icon icon={PlusIcon} size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="pane-body">
        {/* the tree takes the keyboard when it is clicked into: the arrows
            walk it, ⌘↑ ⌘↓ move a row, ⏎ enters, F2 renames */}
        <div className="list tree" role="tree" tabIndex={0} onKeyDown={onKeyDown}>
          <div
            className={`tree-row list-row root${focus === null ? " on" : ""}${drop?.id === "root" ? " drop-into" : ""}`}
            onClick={home}
            onDragOver={(e) => {
              if (!dragging.current) return;
              e.preventDefault();
              setDrop((d) => (d?.id === "root" ? d : { id: "root", where: "into" }));
            }}
            onDragLeave={() => setDrop((x) => (x?.id === "root" ? null : x))}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragging.current;
              dragging.current = null;
              setDrop(null);
              if (id) reorder(id, null, null);
            }}
            role="treeitem"
            aria-level={1}
          >
            <span className="tree-twist none" aria-hidden />
            <span className="row-glyph k-page">
              <Icon icon={BookIcon} size={12} strokeWidth={1.9} />
            </span>
            <span className="list-word">{name}</span>
          </div>
          {rows(null, 1)}
          {childrenOf(g, null).length === 0 && <p className="pane-empty">Nothing yet. Add a chapter, or a note.</p>}
        </div>
      </div>
    </aside>
  );
}

/** a row's name being written: Enter keeps, Escape leaves it */
function Name({ node, onDone }: { node: GraphNode; onDone: () => void }) {
  const [v, setV] = useState(node.title);
  const ref = useRef<HTMLInputElement>(null);
  // the click that opened it is still landing: select after it, not before
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const id = requestAnimationFrame(() => el.select());
    return () => cancelAnimationFrame(id);
  }, []);
  const keep = () => {
    if (v.trim() && v !== node.title) rename(node.id, v.trim());
    onDone();
  };
  return (
    <input
      ref={ref}
      className="tree-name"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={keep}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.preventDefault(), keep());
        else if (e.key === "Escape") (e.preventDefault(), onDone());
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.preventDefault()}
      spellCheck={false}
      aria-label="Name"
    />
  );
}
