import { Icon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, DiceIcon } from "../icons";
import { KINDS, type Field } from "../graph/kinds";
import { graph, updateData, type GraphNode } from "../state/graph";
import { nav } from "../state/nav";

/** The right pane: what the selection is, and its every setting. */
export function Inspector() {
  const g = graph.use();
  const focus = nav.use((n) => n.focus);
  const ids = g.selection;
  const node = ids.length === 1 ? g.nodes[ids[0]] : ids.length === 0 && focus ? g.nodes[focus] : undefined;
  const isWorkspace = !ids.length && !!focus;

  return (
    <aside className="pane right card" aria-label="Inspector">
      <div className="pane-head">
        <div>
          <div className="pane-title">{node ? node.title : ids.length > 1 ? `${ids.length} nodes` : "Nothing selected"}</div>
          <div className="pane-note">
            {node ? (isWorkspace ? `This workspace · ${KINDS[node.kind].title}` : KINDS[node.kind].note) : ids.length > 1 ? "Select one to edit it" : "Select a node on the field"}
          </div>
        </div>
      </div>
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

function FieldRow({ node, field }: { node: GraphNode; field: Field }) {
  const v = node.data[field.key];
  const set = (val: string | number) => updateData(node.id, { [field.key]: val });

  if (field.type === "line") {
    return (
      <div className="group-row col">
        <div className="group-name">{field.label}</div>
        <input className="inp" value={String(v ?? "")} onChange={(e) => set(e.target.value)} spellCheck={false} />
      </div>
    );
  }

  if (field.type === "text") {
    return (
      <div className="group-row col">
        <div className="group-name">{field.label}</div>
        <textarea
          className="inp"
          rows={field.rows ?? 4}
          value={String(v ?? "")}
          onChange={(e) => set(e.target.value)}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="group-row">
      <div className="group-what">
        <div className="group-name">{field.label}</div>
      </div>
      <div className="group-ctl">
        {field.type === "seed" && (
          <>
            <span className="px">{String(v)}</span>
            <button className="pill-icon sm" aria-label="New seed" onClick={() => set(Math.floor(Math.random() * 1_000_000))}>
              <Icon icon={DiceIcon} size={13} strokeWidth={2} />
            </button>
          </>
        )}
        {field.type === "select" && (
          <label className="pill pill-sm select">
            <span>{String(v)}</span>
            <Icon icon={ChevronDownIcon} size={11} strokeWidth={2.2} />
            <select value={String(v)} onChange={(e) => set(e.target.value)} aria-label={field.label}>
              {field.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
        )}
        {field.type === "number" && (
          <div className="seg">
            <button
              className="seg-btn key"
              aria-label="Less"
              onClick={() => set(Math.max(field.min, round(Number(v) - field.step, field.digits)))}
            >
              <Icon icon={ChevronLeftIcon} size={11} strokeWidth={2.2} />
            </button>
            <span className="seg-val px">{fmt(Number(v), field.digits)}</span>
            <button
              className="seg-btn key"
              aria-label="More"
              onClick={() => set(Math.min(field.max, round(Number(v) + field.step, field.digits)))}
            >
              <Icon icon={ChevronRightIcon} size={11} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const round = (n: number, digits = 0) => Number(n.toFixed(digits));
const fmt = (n: number, digits = 0) => n.toFixed(digits);
