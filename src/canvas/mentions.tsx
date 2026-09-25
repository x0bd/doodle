import { useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { Icon, type IconSvgElement } from "../icons";
import { graph, type GraphNode } from "../state/graph";
import type { NodeKind } from "../graph/kinds";

const MENTIONABLE = new Set<NodeKind>(["character", "location", "object", "style", "shot", "note", "prompt", "board"]);
/** the ones that are someone, somewhere or something — with a look of their own */
const LOOKED = new Set<NodeKind>(["character", "location", "object"]);
/** the ones whose pictures ride when named: those, and a style's references, a board's pictures */
const PICTURED = new Set<NodeKind>([...LOOKED, "style", "board"]);
const AT = /(^|\s)@([^\s@]*)$/;

/** The things a mention can name, longest title first so a longer name
 *  wins over a shorter one it contains. */
export function mentionables(): GraphNode[] {
  const g = graph.get();
  return g.order
    .map((id) => g.nodes[id])
    .filter((n) => MENTIONABLE.has(n.kind) && n.title.trim())
    .sort((a, b) => b.title.length - a.title.length);
}

/** `@Name` in a text becomes what Name is — for the prompt compiler. */
export function expandMentions(text: string): string {
  let out = text;
  for (const n of mentionables()) {
    const what = LOOKED.has(n.kind) ? `${n.data.name || n.title} (${n.data.description})` : n.kind === "board" ? `the mood of the board "${n.title}"` : n.kind === "style" ? `${n.title}: ${n.data.description}` : String(n.data.description || n.data.text || n.title);
    out = out.split(`@${n.title}`).join(what);
  }
  return out;
}

/** Who, where and what a text names with `@` — the ones with a picture
 *  ride into the request with it (PLAN.md M5.2). */
export function mentionedIn(text: string): GraphNode[] {
  const found: GraphNode[] = [];
  let rest = text;
  // longest first, and each mention taken out once found, so "@Mara's lamp" is not also "@Mara"
  for (const n of mentionables()) {
    if (!PICTURED.has(n.kind) || !rest.includes(`@${n.title}`)) continue;
    found.push(n);
    rest = rest.split(`@${n.title}`).join(" ");
  }
  return found;
}

/** Type @ in a field and pick from what the graph holds. Wire the returned
 *  handlers into the textarea; render `menu` right after it. */
export function useMentions(ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>, value: string, set: (v: string) => void, glyph: Record<NodeKind, IconSvgElement>) {
  const [open, setOpen] = useState<{ q: string; at: number } | null>(null);
  const [hl, setHl] = useState(0);

  const items = open ? mentionables().filter((n) => n.title.toLowerCase().startsWith(open.q.toLowerCase())).slice(0, 6) : [];

  const look = () => {
    const el = ref.current;
    if (!el) return;
    const text = el.value; // the field's own, not the render's
    const caret = el.selectionStart ?? text.length;
    const m = text.slice(0, caret).match(AT);
    if (m) {
      setOpen({ q: m[2], at: caret - m[2].length - 1 });
      setHl(0);
    } else setOpen(null);
  };

  const choose = (n: GraphNode) => {
    if (!open) return;
    const el = ref.current;
    const text = el?.value ?? value;
    const caret = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, open.at)}@${n.title} ${text.slice(caret)}`;
    set(next);
    setOpen(null);
    requestAnimationFrame(() => {
      const p = open.at + n.title.length + 2;
      el?.setSelectionRange(p, p);
      el?.focus();
    });
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") (e.preventDefault(), setHl((h) => (h + 1) % items.length));
    else if (e.key === "ArrowUp") (e.preventDefault(), setHl((h) => (h - 1 + items.length) % items.length));
    else if (e.key === "Enter" || e.key === "Tab") (e.preventDefault(), choose(items[hl]));
    else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setOpen(null));
  };

  const menu =
    open && items.length ? (
      <div className="mentions card" role="listbox">
        <div className="list">
          {items.map((n, i) => (
            <button key={n.id} className={`list-row${i === hl ? " hl" : ""}`} role="option" aria-selected={i === hl} onMouseDown={(e) => (e.preventDefault(), choose(n))}>
              <Icon icon={glyph[n.kind]} size={13} strokeWidth={1.8} />
              <span className="list-word">{n.title}</span>
              <span className="list-key">{n.kind}</span>
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return { menu, onKeyDown, afterChange: look, onSelect: look, close: () => setOpen(null) };
}
