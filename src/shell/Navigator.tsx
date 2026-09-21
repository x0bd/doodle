import { Icon, CheckIcon, PlusIcon, ModelIcon, TextIcon, GenerateIcon, ImageIcon, GraphIcon, type IconSvgElement } from "../icons";
import { graph, select, makeNode, addNode } from "../state/graph";
import { fitRect, camera } from "../canvas/camera";
import { screenRect } from "../canvas/view";
import type { NodeKind } from "../graph/kinds";
import { doc } from "../state/doc";

const GLYPH: Record<NodeKind, IconSvgElement> = {
  model: ModelIcon,
  prompt: TextIcon,
  generate: GenerateIcon,
  preview: ImageIcon,
};

/** The left pane: where you are, and what is here. */
export function Navigator() {
  const g = graph.use();
  const name = doc.use((d) => d.name);
  const add = () => {
    // a new prompt in the middle of the view, for now
    const c = camera.get();
    const x = (window.innerWidth / 2 - c.x) / c.zoom - 110;
    const y = (window.innerHeight / 2 - c.y) / c.zoom - 80;
    addNode(makeNode("prompt", Math.round(x), Math.round(y)));
  };
  const go = (id: string) => {
    select([id]);
    const n = g.nodes[id];
    if (n) fitRect(n, screenRect(), 200);
  };
  return (
    <aside className="pane left card" aria-label="Navigator">
      <div className="pane-head">
        <span className="pane-title">{name}</span>
        <button className="pill-icon sm" aria-label="Add node" title="Add a prompt" onClick={add}>
          <Icon icon={PlusIcon} size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="pane-body">
        <div className="list">
          <div className="list-head">Graphs</div>
          <Row icon={GraphIcon} on>{name}</Row>
          <div className="list-gap" />
          <div className="list-head">Nodes</div>
          {[...g.order].sort().map((id) => {
            const n = g.nodes[id];
            return (
              <Row key={id} icon={GLYPH[n.kind]} hl={g.selection.includes(id)} onClick={() => go(id)} onDoubleClick={() => go(id)}>
                {n.title}
              </Row>
            );
          })}
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
