/**
 * The writer: a ProseMirror view over a document's words.
 *
 * It holds its own blocks while you write and hands back text (markup.ts)
 * on every change; when the text changes from elsewhere — a writer
 * streaming in, the journal undoing — it reads it again and keeps the
 * caret where it was in the words. Around the words: a bubble over a
 * selection (the marks, and whatever the page adds — a beat from it), a
 * quiet key in the margin naming the block the caret is in (and changing
 * it), the tied passages under the words, `@` names as tokens with a menu
 * to choose them.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorState, Plugin, TextSelection, type Command, type Transaction } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { history, undo as pmUndo, redo as pmRedo } from "prosemirror-history";
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift, splitBlock } from "prosemirror-commands";
import { inputRules, InputRule, textblockTypeInputRule, wrappingInputRule } from "prosemirror-inputrules";
import type { MarkType, NodeType } from "prosemirror-model";
import { schema, BLOCKS, type Form } from "./schema";
import { parse, serialize, plainOf, toPos, toOffset } from "./markup";

const N = schema.nodes;
const K = schema.marks;

export interface Tie {
  id: string;
  /** where the tied words are, in the plain words (markup.ts `plain`) */
  start: number;
  end: number;
  loose?: boolean;
}
/** what is selected, as words, and where it starts in them */
export interface Picked {
  text: string;
  at: number;
}
export interface MentionItem {
  id: string;
  title: string;
  hint?: string;
  icon?: ReactNode;
}

// ─── the editor that has the keyboard, for the menu bar's undo ────────────

let focused: EditorView | null = null;
/** Edit › Undo and Redo, while a writer has the keyboard: its own history */
export const editorUndo = () => !!focused && pmUndo(focused.state, focused.dispatch);
export const editorRedo = () => !!focused && pmRedo(focused.state, focused.dispatch);

// ─── commands ───────────────────────────────────────────────────────────────

const inQuote = (state: EditorState) => {
  const $f = state.selection.$from;
  for (let d = $f.depth; d > 0; d--) if ($f.node(d).type === N.quote) return true;
  return false;
};

/** make the caret's block this kind of block */
function setBlock(type: string, level?: number): Command {
  return (state, dispatch, view) => {
    if (type === "quote") return inQuote(state) ? false : wrapIn(N.quote)(state, dispatch, view);
    if (inQuote(state)) lift(state, dispatch, view);
    const s = view ? view.state : state;
    return setBlockType(N[type], level ? { level } : null)(s, dispatch, view);
  };
}

/** the block after this one, the way a screenplay moves on: a character
 *  speaks, a transition cuts to a scene, a scene opens on action */
const AFTER: Record<string, string> = {
  scene: "paragraph",
  paragraph: "paragraph",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "paragraph",
  transition: "scene",
};
/** Tab turns the block into the one a writer most often wants next */
const TAB: Record<string, string> = {
  paragraph: "character",
  character: "transition",
  transition: "scene",
  scene: "paragraph",
  dialogue: "parenthetical",
  parenthetical: "dialogue",
};

const screenplayEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const block = $from.parent;
  // an empty element steps back to action, the way an empty list item ends the list
  if (empty && !block.content.size && block.type !== N.paragraph) {
    return setBlockType(N.paragraph)(state, dispatch);
  }
  const next = N[AFTER[block.type.name] ?? "paragraph"];
  if (!dispatch) return true;
  const tr = state.tr;
  if (!empty) tr.deleteSelection();
  const at = tr.selection.$from;
  tr.split(at.pos, 1, [{ type: next }]);
  dispatch(tr.scrollIntoView());
  return true;
};

const cycle = (dir: 1 | -1): Command => (state, dispatch) => {
  const name = state.selection.$from.parent.type.name;
  let to = TAB[name];
  if (dir < 0) to = Object.keys(TAB).find((k) => TAB[k] === name) ?? "paragraph";
  if (!to) return false;
  return setBlockType(N[to])(state, dispatch);
};

const hardBreak: Command = (state, dispatch) => {
  const parent = state.selection.$from.parent;
  if (!parent.type.contentMatch.matchType(N.hard_break)) return false;
  dispatch?.(state.tr.replaceSelectionWith(N.hard_break.create()).scrollIntoView());
  return true;
};

// ─── what typing does ───────────────────────────────────────────────────────

/** `**words**` as you close them becomes the mark, the delimiters gone */
function markRule(re: RegExp, type: MarkType, open: number) {
  return new InputRule(re, (state, m, start, end) => {
    const inner = m[m.length - 1];
    if (!state.doc.resolve(start).parent.type.allowsMarkType(type)) return null;
    const lead = m[0].length - inner.length - 2 * open; // what the pattern took before the delimiter
    const from = start + lead;
    const tr = state.tr;
    tr.delete(from + open + inner.length, end); // the closing delimiter typed so far
    tr.delete(from, from + open); // the opening one
    tr.addMark(from, from + inner.length, type.create());
    tr.removeStoredMark(type);
    return tr;
  });
}

/** a screenplay element announced by what is typed, the words kept */
function becomes(re: RegExp, type: NodeType, from: string[], keep = true) {
  return new InputRule(re, (state, m, start, end) => {
    const $s = state.doc.resolve(start);
    if (!from.includes($s.parent.type.name)) return null;
    const tr = state.tr;
    if (keep) tr.insertText(m[0].slice(-1), end);
    else tr.delete(start, end);
    tr.setBlockType($s.start(), $s.start(), type);
    return tr;
  });
}

function rules(form: Form) {
  const marks = [
    markRule(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, K.strong, 2),
    markRule(/~~([^~\s](?:[^~]*[^~\s])?)~~$/, K.strike, 2),
    markRule(/(?:^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, K.em, 1),
    markRule(/(?:^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, K.em, 1),
  ];
  if (form === "screenplay")
    return inputRules({
      rules: [
        ...marks,
        becomes(/^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)\.\s$/i, N.scene, ["paragraph"]),
        becomes(/^[A-Z0-9 .'’-]*TO:$/, N.transition, ["paragraph"]),
        becomes(/^\($/, N.parenthetical, ["dialogue", "paragraph"], false),
      ],
    });
  return inputRules({
    rules: [
      ...marks,
      textblockTypeInputRule(/^(#{1,3})\s$/, N.heading, (m) => ({ level: m[1].length })),
      wrappingInputRule(/^\s*>\s$/, N.quote),
    ],
  });
}

function keys(form: Form) {
  const common: Record<string, Command> = {
    "Mod-z": pmUndo,
    "Shift-Mod-z": pmRedo,
    "Mod-y": pmRedo,
    "Mod-b": toggleMark(K.strong),
    "Mod-i": toggleMark(K.em),
    "Shift-Mod-x": toggleMark(K.strike),
    "Shift-Enter": hardBreak,
  };
  if (form === "screenplay")
    return keymap({ ...common, Enter: screenplayEnter, Tab: cycle(1), "Shift-Tab": cycle(-1) });
  return keymap({
    ...common,
    "Shift-Mod-t": setBlock("heading", 1),
    "Shift-Mod-h": setBlock("heading", 2),
    "Shift-Mod-j": setBlock("heading", 3),
    "Shift-Mod-b": setBlock("paragraph"),
    // Enter on an empty line in a quote leaves the quote
    Enter: (state, dispatch, view) => {
      const { $from, empty } = state.selection;
      if (empty && inQuote(state) && !$from.parent.content.size) return lift(state, dispatch, view);
      return splitBlock(state, dispatch, view);
    },
  });
}

// ─── the component ──────────────────────────────────────────────────────────

interface Props {
  value: string;
  form?: Form;
  onChange?: (text: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** the caret in the words, at the end, when this key changes (and on arrival) */
  focusKey?: string | false;
  className?: string;
  ties?: Tie[];
  lit?: string | null;
  /** the names that read as tokens after an `@` */
  names?: string[];
  /** what an `@` offers, for what has been typed after it */
  mentions?: (q: string) => MentionItem[];
  /** what is selected, as it changes */
  onPick?: (p: Picked | null) => void;
  /** more keys for the bubble over a selection */
  bubble?: (p: Picked) => ReactNode;
  /** the key in the margin naming the caret's block */
  gutter?: boolean;
}

interface Over {
  bubble?: { x: number; y: number; picked: Picked; on: Record<string, boolean> };
  block?: { y: number; name: string };
  mention?: { x: number; y: number; q: string; from: number; to: number };
}

export function Editor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const last = useRef(props.value);
  const p = useRef(props);
  p.current = props;
  const [over, setOver] = useState<Over>({});
  const [menu, setMenu] = useState(false);
  const [hl, setHl] = useState(0);
  const form = props.form ?? "prose";

  const items = over.mention && props.mentions ? props.mentions(over.mention.q).slice(0, 6) : [];
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const hlRef = useRef(hl);
  hlRef.current = hl;
  const overRef = useRef(over);
  overRef.current = over;

  /** where the chrome goes: the host's own units, whatever zoom it is under */
  const place = (v: EditorView) => {
    const el = host.current;
    if (!el) return {};
    const box = el.getBoundingClientRect();
    const z = el.offsetWidth ? box.width / el.offsetWidth : 1;
    const { state } = v;
    const sel = state.selection;
    const out: Over = {};
    const hasFocus = v.hasFocus();
    if (hasFocus && !sel.empty && v.editable) {
      const a = v.coordsAtPos(sel.from);
      const b = v.coordsAtPos(sel.to);
      const pl = plainOf(state.doc);
      const at = toOffset(pl, sel.from);
      const text = pl.text.slice(at, toOffset(pl, sel.to)).trim();
      out.bubble = {
        x: ((a.top === b.top ? (a.left + b.right) / 2 : a.left) - box.left) / z,
        y: (Math.min(a.top, b.top) - box.top) / z,
        picked: { text, at },
        on: {
          strong: state.doc.rangeHasMark(sel.from, sel.to, K.strong),
          em: state.doc.rangeHasMark(sel.from, sel.to, K.em),
          strike: state.doc.rangeHasMark(sel.from, sel.to, K.strike),
        },
      };
    }
    if (hasFocus && p.current.gutter && v.editable) {
      const $f = sel.$from;
      const c = v.coordsAtPos($f.start());
      const block = $f.parent;
      const inQ = inQuote(state);
      const spec = BLOCKS[p.current.form ?? "prose"].find((b) =>
        inQ ? b.type === "quote" : b.type === block.type.name && (b.level === undefined || b.level === block.attrs.level),
      );
      out.block = { y: (c.top - box.top) / z, name: spec?.name ?? "Body" };
    }
    if (hasFocus && sel.empty && p.current.mentions) {
      const $f = sel.$from;
      const before = $f.parent.textBetween(0, $f.parentOffset, undefined, "￼");
      const m = before.match(/(^|\s)@([^\s@]*)$/);
      if (m) {
        const from = $f.pos - m[2].length - 1;
        const c = v.coordsAtPos(from);
        out.mention = { x: (c.left - box.left) / z, y: (c.bottom - box.top) / z, q: m[2], from, to: $f.pos };
      }
    }
    return out;
  };

  const report = (v: EditorView) => {
    const next = place(v);
    setOver((was) => {
      if (was.mention?.q !== next.mention?.q) setHl(0);
      return next;
    });
    const b = next.bubble;
    p.current.onPick?.(b && b.picked.text ? b.picked : null);
  };

  const choose = (item: MentionItem) => {
    const v = view.current;
    const m = overRef.current.mention;
    if (!v || !m) return;
    v.dispatch(v.state.tr.insertText(`@${item.title} `, m.from, m.to));
    v.focus();
  };

  // the view, once
  useEffect(() => {
    const decorations = new Plugin({
      props: {
        decorations(state) {
          const { ties, lit, names, placeholder } = p.current;
          const out: Decoration[] = [];
          const first = state.doc.firstChild;
          if (placeholder && state.doc.childCount === 1 && first?.isTextblock && !first.content.size)
            out.push(Decoration.node(0, first.nodeSize, { class: "is-empty", "data-placeholder": placeholder }));
          if (ties?.length || names?.length) {
            const pl = plainOf(state.doc);
            for (const t of ties ?? []) {
              const a = toPos(pl, t.start);
              const b = toPos(pl, t.end);
              if (b > a) out.push(Decoration.inline(a, b, { class: `tie${t.loose ? " loose" : ""}${lit === t.id ? " lit" : ""}` }));
            }
            for (const n of names ?? []) {
              const needle = `@${n}`;
              for (let i = pl.text.indexOf(needle); i >= 0; i = pl.text.indexOf(needle, i + needle.length)) {
                out.push(Decoration.inline(toPos(pl, i), toPos(pl, i + needle.length), { class: "mention-token" }));
              }
            }
          }
          return DecorationSet.create(state.doc, out);
        },
      },
    });
    const f = p.current.form ?? "prose";
    const v = new EditorView({ mount: mount.current! }, {
      state: EditorState.create({ doc: parse(p.current.value, f), plugins: [history(), rules(f), keys(f), keymap(baseKeymap), decorations] }),
      editable: () => !p.current.readOnly,
      attributes: { class: `pm ${p.current.className ?? ""}`, spellcheck: "true" },
      handleKeyDown(_v, e) {
        const list = itemsRef.current;
        if (!overRef.current.mention || !list.length) return false;
        if (e.key === "ArrowDown") return setHl((h) => (h + 1) % list.length), true;
        if (e.key === "ArrowUp") return setHl((h) => (h - 1 + list.length) % list.length), true;
        if (e.key === "Enter" || e.key === "Tab") return choose(list[hlRef.current]), true;
        if (e.key === "Escape") return e.stopPropagation(), setOver((o) => ({ ...o, mention: undefined })), true;
        return false;
      },
      handleDOMEvents: {
        focus: (vv) => ((focused = vv), report(vv), false),
        blur: (vv) => {
          if (focused === vv) focused = null;
          // let a click on the chrome land before the chrome goes
          setTimeout(() => !vv.hasFocus() && (setOver({}), setMenu(false), p.current.onPick?.(null)), 160);
          return false;
        },
      },
      dispatchTransaction(tr: Transaction) {
        const vv = view.current!;
        vv.updateState(vv.state.apply(tr));
        if (tr.docChanged && !tr.getMeta("outside")) {
          const text = serialize(vv.state.doc, p.current.form ?? "prose");
          if (text !== last.current) {
            last.current = text;
            p.current.onChange?.(text);
          }
        }
        report(vv);
      },
    });
    view.current = v;
    return () => {
      if (focused === v) focused = null;
      v.destroy();
      view.current = null;
    };
    // the form's rules are the view's own; a new form is a new view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // the words changed from elsewhere: read them again, the caret where it was in them
  useEffect(() => {
    const v = view.current;
    if (!v || props.value === last.current) return;
    last.current = props.value;
    const was = toOffset(plainOf(v.state.doc), v.state.selection.from);
    const doc = parse(props.value, form);
    const tr = v.state.tr.replaceWith(0, v.state.doc.content.size, doc.content).setMeta("outside", true).setMeta("addToHistory", false);
    const pos = Math.min(toPos(plainOf(tr.doc), was), tr.doc.content.size);
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
    v.dispatch(tr);
  }, [props.value, form]);

  // the chrome and the decorations follow what the page says about the words
  useEffect(() => {
    const v = view.current;
    if (v) v.dispatch(v.state.tr.setMeta("outside", true));
  }, [props.ties, props.lit, props.names, props.readOnly, props.placeholder]);

  // the caret in the words, at the end — nothing to click first
  useEffect(() => {
    const v = view.current;
    if (!v || props.focusKey === false || props.focusKey === undefined) return;
    const end = TextSelection.atEnd(v.state.doc);
    v.dispatch(v.state.tr.setSelection(end).setMeta("outside", true));
    v.focus();
  }, [props.focusKey, form]);

  const run = (cmd: Command) => {
    const v = view.current;
    if (!v) return;
    cmd(v.state, v.dispatch, v);
    v.focus();
  };
  const blocks = BLOCKS[form];

  return (
    <div className="writer" ref={host} onPointerDown={(e) => e.stopPropagation()}>
      <div ref={mount} />
      {over.block && (
        <div className="writer-gutter" style={{ top: over.block.y }}>
          <button className="writer-block" onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu((m) => !m)} title="What this block is">
            {over.block.name}
          </button>
          {menu && (
            <div className="writer-menu card" role="menu">
              <div className="list">
                {blocks.map((b) => (
                  <button
                    key={b.name}
                    className={`list-row${b.name === over.block!.name ? " on" : ""}`}
                    role="menuitem"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (run(setBlock(b.type, b.level)), setMenu(false))}
                  >
                    <span className="list-word">{b.name}</span>
                    {b.key && <span className="list-key">{b.key}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {over.bubble && (
        <div className="writer-bubble" style={{ left: over.bubble.x, top: over.bubble.y }} onMouseDown={(e) => e.preventDefault()}>
          <button className={`wb-key wb-b${over.bubble.on.strong ? " on" : ""}`} title="Bold — ⌘B" onClick={() => run(toggleMark(K.strong))}>B</button>
          <button className={`wb-key wb-i${over.bubble.on.em ? " on" : ""}`} title="Italic — ⌘I" onClick={() => run(toggleMark(K.em))}>I</button>
          <button className={`wb-key wb-s${over.bubble.on.strike ? " on" : ""}`} title="Strikethrough — ⇧⌘X" onClick={() => run(toggleMark(K.strike))}>S</button>
          {props.bubble && over.bubble.picked.text && (
            <>
              <span className="wb-gap" />
              {props.bubble(over.bubble.picked)}
            </>
          )}
        </div>
      )}
      {over.mention && items.length > 0 && (
        <div className="mentions card writer-mentions" role="listbox" style={{ left: over.mention.x, top: over.mention.y + 6 }}>
          <div className="list">
            {items.map((n, i) => (
              <button key={n.id} className={`list-row${i === hl ? " hl" : ""}`} role="option" aria-selected={i === hl} onMouseDown={(e) => (e.preventDefault(), choose(n))}>
                {n.icon}
                <span className="list-word">{n.title}</span>
                {n.hint && <span className="list-key">{n.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
