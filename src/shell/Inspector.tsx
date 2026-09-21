import { KINDS } from "../graph/kinds";
import { graph } from "../state/graph";
import { FieldRow } from "./Fields";
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

