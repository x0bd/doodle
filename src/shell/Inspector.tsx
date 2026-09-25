import { KINDS } from "../graph/kinds";
import { useState } from "react";
import { tagsIn } from "../state/tags";
import { addTags, removeTag } from "../state/tagging";
import { graph, select, setStatus, type Canon, type GraphNode } from "../state/graph";
import { prov, behind } from "../state/prov";
import { remix, remixable } from "../state/remix";
import { FieldRow } from "./Fields";
import { GLYPH } from "../canvas/Doc";
import { Icon, CloseIcon, PopUpIcon } from "../icons";
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
const GATHERED = new Set(["board", "clip", "group"]);

/** The book's look (M5.5): which style every picture is made in, unless it has its own */
function Look() {
  const d = doc.use();
  const styles = graph.use((g) => g.order).map((id) => graph.get().nodes[id]).filter((n) => n?.kind === "style" && n.status !== "rejected");
  const on = styles.find((s) => s.id === d.bible.look);
  return (
    <div className="group-row" title="Every picture made without a style of its own is made in this one, its references riding along">
      <div className="group-name">The book's look</div>
      <div className="group-ctl">
        <label className="pill pill-sm select">
          <span>{on ? on.title : "None"}</span>
          <Icon icon={PopUpIcon} size={12} strokeWidth={2} />
          <select value={on?.id ?? ""} onChange={(e) => setBible({ look: e.target.value })} aria-label="The book's look">
            <option value="">None</option>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

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
      {/* gathered things (a board, its clippings and groups) are not canon or a draft */}
      {(node ? !GATHERED.has(node.kind) : ids.length > 1 && !ids.every((i) => GATHERED.has(g.nodes[i]?.kind))) && (
        <div className="pane-body">
          <div className="group-head">State</div>
          <div className="group">
            <div className="group-row col">
              <div className="group-name">{ids.length > 1 ? `${ids.length} nodes are` : "This one is"}</div>
              <div className="seg seg-full" role="radiogroup" aria-label="State">
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
      {(node || ids.length > 1) && <Tags ids={node ? [node.id] : ids} />}
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
            <Look />
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
          {KINDS[node.kind].groups.length === 0 && <p className="pane-empty">{node.kind === "preview" ? "Nothing to set. It shows what it is given." : KINDS[node.kind].note}</p>}
        </div>
      )}
      {node && <Source node={node} />}
    </aside>
  );
}

const when = (t: number) => {
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

/** Where this came from: the record kept when it was made. Nothing here is
 *  editable — it is what happened. */
function Source({ node }: { node: GraphNode }) {
  prov.use();
  const [open, setOpen] = useState(false);
  const p = behind(node.id);
  if (!p) return null;
  return (
    <div className="pane-body">
      <div className="group-head">Where this came from</div>
      <div className="group">
        <div className="group-row">
          <div className="group-name">Made by</div>
          <div className="group-val">{p.provider}{p.model && p.model !== "default" ? ` · ${p.model}` : ""}</div>
        </div>
        <div className="group-row">
          <div className="group-name">When</div>
          <div className="group-val">{when(p.at)}</div>
        </div>
        {p.seed !== undefined && (
          <div className="group-row">
            <div className="group-name">Seed</div>
            <div className="group-val mono">{p.seed}</div>
          </div>
        )}
        {p.pictures && p.pictures.length > 0 && (
          <div className="group-row">
            <div className="group-name">Shown</div>
            <div className="group-val">{p.pictures.map((l) => l.replace(/ \(.*\)$/, "")).join(", ")}</div>
          </div>
        )}
        {p.inputs.length > 0 && (
          <div className="group-row col">
            <div className="group-name">From</div>
            <ul className="from-list">
              {p.inputs.map((i) => (
                <li key={i.port + i.node}>
                  <button className={`from-row k-${i.kind}`} onClick={() => select([i.node])} title={`Select ${i.title}`}>
                    <span className="from-port px">{i.port}</span>
                    <span className="from-title">{i.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {remixable(p.key) && (
          <button className="group-row group-more" onClick={() => remix(p.key)} title="A new generator under the one that made this, fed the same, its seed held">
            <div className="group-name">Remix</div>
            <div className="group-val">a branch from this</div>
          </button>
        )}
        <button className="group-row group-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <div className="group-name">What was asked</div>
          <div className="group-val">{open ? "hide" : "show"}</div>
        </button>
        {open && (
          <div className="group-row col">
            <pre className="said selectable">{p.prompt}</pre>
            {p.system && <pre className="said dim selectable">{p.system}</pre>}
            {p.rules && <pre className="said dim selectable">{p.rules}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}


/** Tags (M3.8): what it is filed under — each a chip that comes off; a
 *  field to add more (a comma between them). For a selection, the tags any
 *  of them carries, and adding goes to all. */
function Tags({ ids }: { ids: string[] }) {
  const g = graph.use();
  const [typed, setTyped] = useState("");
  const nodes = ids.map((id) => g.nodes[id]).filter(Boolean);
  const all = tagsIn(nodes);
  const add = () => {
    addTags(ids, typed);
    setTyped("");
  };
  return (
    <div className="pane-body">
      <div className="group-head">Tags</div>
      <div className="group">
        <div className="group-row col">
          {all.length > 0 && (
            <div className="tag-chips">
              {all.map(({ tag, n }) => (
                <span key={tag} className="tag-chip">
                  <span>#{tag}</span>
                  {ids.length > 1 && n < ids.length && <span className="tag-n px">{n}</span>}
                  <button className="tag-off" onClick={() => removeTag(ids, tag)} aria-label={`Take off #${tag}`} title="Take it off">
                    <Icon icon={CloseIcon} size={10} strokeWidth={2.2} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            className="inp"
            value={typed}
            placeholder={all.length ? "Another tag" : "A tag — harbour, mara, the storm"}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.preventDefault(), add());
            }}
            onBlur={() => typed.trim() && add()}
            spellCheck={false}
            aria-label="Add a tag"
          />
        </div>
      </div>
    </div>
  );
}
