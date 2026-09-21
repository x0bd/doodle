import { Icon, CheckIcon, PlusIcon, ModelIcon, TextIcon, GenerateIcon, ImageIcon, GraphIcon, CharacterIcon, StyleIcon, WriteIcon, PageIcon, NoteIcon, UpIcon, type IconSvgElement } from "../icons";
import { graph, select, makeNode, addNode, childrenOf } from "../state/graph";
import { nav, enter, rise, trail } from "../state/nav";
import { fitAll } from "../canvas/view";
import { fitRect, camera } from "../canvas/camera";
import { screenRect } from "../canvas/view";
import type { NodeKind } from "../graph/kinds";
import { doc } from "../state/doc";

const GLYPH: Record<NodeKind, IconSvgElement> = {
  model: ModelIcon,
  prompt: TextIcon,
  generate: GenerateIcon,
  preview: ImageIcon,
  character: CharacterIcon,
  style: StyleIcon,
  write: WriteIcon,
  page: PageIcon,
  note: NoteIcon,
};

/** The left pane: where you are, and what is here. */
export function Navigator() {
  const g = graph.use();
  const name = doc.use((d) => d.name);
  const focus = nav.use((n) => n.focus);
  const here = childrenOf(g, focus);
  const path = trail();
  const add = () => {
    // a new note in the middle of the view, in this workspace
    const c = camera.get();
    const x = (window.innerWidth / 2 - c.x) / c.zoom - 110;
    const y = (window.innerHeight / 2 - c.y) / c.zoom - 70;
    addNode(makeNode(focus ? "note" : "prompt", Math.round(x), Math.round(y), { parent: focus }));
  };
  const go = (id: string) => {
    select([id]);
    const n = g.nodes[id];
    if (n) fitRect(n, screenRect(), 200);
  };
  const into = (id: string) => enter(id, () => requestAnimationFrame(fitAll));
  return (
    <aside className="pane left card" aria-label="Navigator">
      <div className="pane-head">
        <span className="pane-title">{focus ? g.nodes[focus]?.title : name}</span>
        <button className="pill-icon sm" aria-label="Add node" title={focus ? "Add a note here" : "Add a prompt"} onClick={add}>
          <Icon icon={PlusIcon} size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="pane-body">
        <div className="list">
          {path.length ? (
            <>
              <Row icon={UpIcon} onClick={() => rise(() => requestAnimationFrame(fitAll))}>
                {path.length > 1 ? g.nodes[path[path.length - 2]].title : name}
              </Row>
              <div className="list-gap" />
              <div className="list-head">Inside</div>
            </>
          ) : (
            <>
              <div className="list-head">Graphs</div>
              <Row icon={GraphIcon} on>{name}</Row>
              <div className="list-gap" />
              <div className="list-head">Nodes</div>
            </>
          )}
          {[...here].sort((a, b) => (g.nodes[a].seq ?? 0) - (g.nodes[b].seq ?? 0)).map((id) => {
            const n = g.nodes[id];
            return (
              <Row key={id} icon={GLYPH[n.kind]} hl={g.selection.includes(id)} onClick={() => go(id)} onDoubleClick={() => into(id)}>
                {n.title}
              </Row>
            );
          })}
          {here.length === 0 && <p className="pane-empty">Nothing here yet. Add a note, or drop one in.</p>}
        </div>
      </div>
    </aside>
  );
}

function Row({
  icon, on, hl, children, onClick, onDoubleClick,
}: {
  icon: IconSvgElement;
  on?: boolean;
  hl?: boolean;
  children: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <button className={`list-row${on ? " on" : ""}${hl ? " hl" : ""}`} onClick={onClick} onDoubleClick={onDoubleClick}>
      <Icon icon={icon} size={14} strokeWidth={1.8} />
      <span className="list-word">{children}</span>
      {on && (
        <span className="list-check">
          <Icon icon={CheckIcon} size={12} strokeWidth={2.4} />
        </span>
      )}
    </button>
  );
}
