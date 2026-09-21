import { KINDS } from "../graph/kinds";
import { graph, setStatus, type Canon } from "../state/graph";
import { FieldRow } from "./Fields";
import { GLYPH } from "../canvas/Doc";
import { Icon } from "../icons";
import { doc, setBible } from "../state/doc";
import { nav } from "../state/nav";

const STATE_WORD: Record<Canon, string> = { canon: "Canon", draft: "Draft", exploration: "Explore", rejected: "Rejected" };
const STATE_NOTE: Record<Canon, string> = {
  canon: "Settled. Counts as context.",
  draft: "Proposed or unreviewed.",
  exploration: "A branch — kept, not settled.",
  rejected: "Kept for the record; never counts as context.",
};
const BIBLE_HINT = { tone: "Quiet, cold, patient. Nothing is explained twice.", rules: "Robots never lie. Plants are the only colour.", avoid: "Text in frame, crowds, sentiment." };

/** The right pane: what the selection is, and its every setting. */
export function Inspector() {
  const g = graph.use();
  const focus = nav.use((n) => n.focus);
  const ids = g.selection;
  const node = ids.length === 1 ? g.nodes[ids[0]] : ids.length === 0 && focus ? g.nodes[focus] : undefined;
  const isWorkspace = !ids.length && !!focus;
  const d = doc.use();
  const atRoot = !ids.length && !focus;

  return (
    <aside className="pane right card" aria-label="Inspector">
      <div className="pane-head">
        {node && (
          <span className={`row-glyph big k-${node.kind}`}>
            <Icon icon={GLYPH[node.kind]} size={14} strokeWidth={1.8} />
          </span>
        )}
        <div className="pane-what">
          <div className="pane-title">{node ? node.title : ids.length > 1 ? `${ids.length} nodes` : atRoot ? d.name : "Nothing selected"}</div>
          <div className="pane-note">
            {node ? (isWorkspace ? `This page · ${KINDS[node.kind].title}` : KINDS[node.kind].note) : ids.length > 1 ? "Select one to edit it" : atRoot ? "The project. Its rules go into every request." : "Select a node on the field"}
          </div>
        </div>
      </div>
      {(node || ids.length > 1) && (
        <div className="pane-body">
          <div className="group-head">State</div>
          <div className="group">
            <div className="group-row">
              <div className="group-what">
                <div className="group-name">{ids.length > 1 ? `${ids.length} nodes` : "This one is"}</div>
              </div>
              <div className="seg" role="radiogroup" aria-label="State">
                {(["canon", "draft", "exploration", "rejected"] as Canon[]).map((c) => {
                  const on = node ? node.status === c : ids.every((i) => g.nodes[i]?.status === c);
                  return (
                    <button key={c} className={`seg-btn key${on ? " on" : ""}`} role="radio" aria-checked={on} onClick={() => setStatus(node ? [node.id] : ids, c)} title={STATE_NOTE[c]}>
                      {STATE_WORD[c]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {atRoot && (
        <div className="pane-body">
          <div className="group-head">Bible</div>
          <div className="group">
            {(["tone", "rules", "avoid"] as const).map((k) => (
              <div key={k} className="group-row col">
                <div className="group-name">{k === "tone" ? "Tone" : k === "rules" ? "Rules of the world" : "Avoid"}</div>
                <textarea className="inp" rows={3} value={d.bible[k]} onChange={(e) => setBible({ [k]: e.target.value })} spellCheck placeholder={BIBLE_HINT[k]} />
              </div>
            ))}
          </div>
        </div>
      )}
      {node && (
        <div className="pane-body">
          {KINDS[node.kind].groups.map((grp) => (
            <div key={grp.name}>
              <div className="group-head">{grp.name}</div>
              <div className="group">
                {grp.fields.map((f) => (
                  <FieldRow key={f.key} node={node} field={f} />
                ))}
              </div>
            </div>
          ))}
          {KINDS[node.kind].groups.length === 0 && <p className="pane-empty">Nothing to set. It shows what it is given.</p>}
        </div>
      )}
    </aside>
  );
}

