import { useEffect } from "react";
import { Icon, PlusIcon, type IconSvgElement } from "../icons";
import { KINDS, type NodeKind } from "../graph/kinds";
import { graph, select, addNode, makeNode, duplicateSelected, deleteSelected, setStatus, childCount, type Canon } from "../state/graph";
import { enter, nav } from "../state/nav";
import { enqueue, RUNNABLE } from "../state/jobs";
import { fitAll } from "./view";
import { GLYPH } from "./Doc";
import type { Point } from "./camera";

export interface Menu {
  at: Point;
  world: Point;
  /** the node under the pointer, if any */
  node?: string;
}

const ADDABLE: NodeKind[] = ["page", "chapter", "prompt", "note", "character", "style", "shot", "generate", "preview", "write", "model"];
const STATES: { id: Canon; word: string }[] = [
  { id: "canon", word: "Canon" },
  { id: "draft", word: "Draft" },
  { id: "exploration", word: "Exploration" },
  { id: "rejected", word: "Rejected" },
];

/** Right-click: on a node, what can be done to it; on the field, what can
 *  be put here. The same list idiom as every menu. */
export function ContextMenu({ menu, onClose }: { menu: Menu; onClose: () => void }) {
  const g = graph.use();
  const node = menu.node ? g.nodes[menu.node] : undefined;
  const focus = nav.use((n) => n.focus);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    const onDown = (e: PointerEvent) => !(e.target as HTMLElement).closest(".cmenu") && onClose();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const add = (kind: NodeKind) => {
    const def = KINDS[kind];
    addNode(makeNode(kind, Math.round(menu.world.x - def.size.w / 2), Math.round(menu.world.y - 20), { parent: focus }));
    onClose();
  };
  const ids = node ? (g.selection.includes(node.id) ? g.selection : [node.id]) : [];
  const many = ids.length > 1;

  const rows = 2 + (node ? 8 : ADDABLE.length + 1);
  const h = 20 + rows * 30;
  const left = Math.min(menu.at.x + 4, window.innerWidth - 236);
  const top = menu.at.y + h > window.innerHeight - 24 ? Math.max(70, menu.at.y - h) : menu.at.y + 4;

  return (
    <div className="cmenu card" style={{ left, top }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
      <div className="list">
        {node ? (
          <>
            <div className="list-head">{many ? `${ids.length} nodes` : node.title}</div>
            {!many && (
              <Row icon={GLYPH[node.kind]} key_="⏎" onClick={() => (onClose(), enter(node.id, () => requestAnimationFrame(fitAll), menu.at))}>
                Open{childCount(g, node.id) ? ` · ${childCount(g, node.id)} inside` : ""}
              </Row>
            )}
            {!many && RUNNABLE.has(node.kind) && (
              <Row key_="⌘⏎" onClick={() => (onClose(), enqueue([node.id]))}>Run this one</Row>
            )}
            <Row key_="⌘D" onClick={() => (select(ids), duplicateSelected(), onClose())}>Duplicate</Row>
            <div className="list-gap" />
            <div className="list-head">State</div>
            {STATES.map((s) => (
              <Row key={s.id} on={ids.every((i) => g.nodes[i]?.status === s.id)} onClick={() => (setStatus(ids, s.id), onClose())}>
                {s.word}
              </Row>
            ))}
            <div className="list-gap" />
            <Row key_="⌫" onClick={() => (select(ids), deleteSelected(), onClose())}>Delete</Row>
          </>
        ) : (
          <>
            <div className="list-head">Add here</div>
            {ADDABLE.map((k) => (
              <Row key={k} icon={GLYPH[k]} onClick={() => add(k)}>
                {KINDS[k].title}
              </Row>
            ))}
            <div className="list-gap" />
            <Row icon={PlusIcon} key_="⌘0" onClick={() => (fitAll(), onClose())}>Fit to view</Row>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ icon, key_, on, children, onClick }: { icon?: IconSvgElement; key_?: string; on?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`list-row${on ? " on" : ""}`} role="menuitem" onClick={onClick}>
      {icon && <Icon icon={icon} size={13} strokeWidth={1.8} />}
      <span className="list-word">{children}</span>
      {key_ && <span className="list-key">{key_}</span>}
    </button>
  );
}
