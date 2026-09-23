import { useEffect } from "react";
import { Icon, PlusIcon, type IconSvgElement } from "../icons";
import { KINDS, type NodeKind } from "../graph/kinds";
import { graph, select, addNode, makeNode, duplicateSelected, deleteSelected, setStatus, childCount, addInput, dropInput, connect, edgeInto, inputs, outputs, type Canon, type GraphNode } from "../state/graph";
import { enter, nav } from "../state/nav";
import { enqueue, RUNNABLE } from "../state/jobs";
import { fitAll } from "./view";
import { remix, remixable } from "../state/remix";
import { GLYPH } from "./Doc";
import type { Point } from "./camera";

export interface Menu {
  at: Point;
  world: Point;
  /** the node under the pointer, if any */
  node?: string;
}

const ADDABLE: NodeKind[] = ["page", "chapter", "prompt", "note", "character", "location", "style", "shot", "generate", "preview", "write", "model"];
/** what can be given to a node that takes words: the kind, and the name
 *  its port gets. A writer can hold as many of these as the work needs. */
const GIVEABLE: { kind: NodeKind; port: string; word: string }[] = [
  { kind: "character", port: "character", word: "A character" },
  { kind: "location", port: "place", word: "A place" },
  { kind: "style", port: "style", word: "A style or a voice" },
  { kind: "prompt", port: "scene", word: "A scene" },
  { kind: "note", port: "note", word: "A note" },
  { kind: "shot", port: "shot", word: "A shot" },
];
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

  /** Make the thing and wire it in: a new port on the node, a card to its
   *  left where there is room, and the wire between them — one gesture. */
  const give = (to: GraphNode, kind: NodeKind, port: string) => {
    const def = KINDS[kind];
    const below = Object.values(g.nodes).filter((n) => n.parent === focus && n.x + n.w < to.x + 40);
    const y = below.length ? Math.max(...below.map((n) => n.y + n.h)) + 30 : to.y;
    const made = makeNode(kind, Math.round(to.x - def.size.w - 90), Math.round(y), { parent: focus, status: to.status });
    addNode(made);
    const id = addInput(to.id, port, "text");
    connect({ node: made.id, port: outputs(made)[0].id }, { node: to.id, port: id });
    select([made.id]);
  };

  const add = (kind: NodeKind) => {
    const def = KINDS[kind];
    addNode(makeNode(kind, Math.round(menu.world.x - def.size.w / 2), Math.round(menu.world.y - 20), { parent: focus }));
    onClose();
  };
  const ids = node ? (g.selection.includes(node.id) ? g.selection : [node.id]) : [];
  const many = ids.length > 1;

  const rows = 2 + (node ? (takesWords(node) ? 15 : 8) : ADDABLE.length + 1);
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
            {!many && remixable(node.asset) && (
              <Row onClick={() => (onClose(), remix(node.asset!))}>Remix — a branch from this</Row>
            )}
            {!many && takesWords(node) && (
              <>
                <div className="list-gap" />
                <div className="list-head">Give it</div>
                {GIVEABLE.map((giv) => (
                  <Row key={giv.port} icon={GLYPH[giv.kind]} onClick={() => (give(node, giv.kind, giv.port), onClose())}>
                    {giv.word}
                  </Row>
                ))}
                {(node.extras ?? []).length > 0 && (
                  <Row onClick={() => (node.extras ?? []).forEach((p) => (edgeInto({ node: node.id, port: p.id }) ? undefined : dropInput(node.id, p.id)))}>
                    Tidy the empty ones
                  </Row>
                )}
              </>
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

/** a node with an input that takes words can be given more of them */
const takesWords = (n: GraphNode) => inputs(n).some((p) => p.type === "text");

function Row({ icon, key_, on, children, onClick }: { icon?: IconSvgElement; key_?: string; on?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`list-row${on ? " on" : ""}`} role="menuitem" onClick={onClick}>
      {icon && <Icon icon={icon} size={13} strokeWidth={1.8} />}
      <span className="list-word">{children}</span>
      {key_ && <span className="list-key">{key_}</span>}
    </button>
  );
}
