import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { camera, panBy, toWorld, zoomAt, type Point, type Rect } from "./camera";
import {
  graph, clearSelection, select, toggleSelect, moveNodes, raise, intersects, deleteSelected,
  connectNow, canConnect, disconnectNow, edgeInto, moveInto, portOf, addNode, makeNode, connect, type PortRef,
} from "../state/graph";
import { KINDS, type NodeKind } from "../graph/kinds";
import { Icon, CloseIcon } from "../icons";
import { GLYPH } from "./Doc";
import { ContextMenu, type Menu } from "./ContextMenu";
import { begin as journalBegin, end as journalEnd, commit, type Snapshot } from "../state/history";
import { Node, type NodeHandlers } from "./Node";
import { nav, enter, rise, clearArrival } from "../state/nav";
import { ui, showBar } from "../state/ui";
import { childrenOf } from "../state/graph";
import { fitAll } from "./view";
import { Wires } from "./Wires";
import { Doc } from "./Doc";
import { portPos, setMapMode } from "./layout";

type Drag =
  | { mode: "pan"; last: Point }
  | { mode: "marquee"; start: Point; additive: string[] }
  | { mode: "move"; last: Point; ids: string[]; before: Snapshot }
  | { mode: "wire"; from: PortRef; a: Point; before: Snapshot };

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/** The node under a screen point that is not one of these, if any. */
function nodeAt(x: number, y: number, not: string[]): string | null {
  const els = document.elementsFromPoint(x, y) as HTMLElement[];
  for (const el of els) {
    const id = el.closest<HTMLElement>("[data-node]")?.dataset.node;
    if (id && !not.includes(id)) return id;
  }
  return null;
}

/** The nearest input within reach that this output can feed, if any. */
function nearestInput(x: number, y: number, from: PortRef, reach = 40): PortRef | null {
  let best: { ref: PortRef; d: number } | null = null;
  for (const el of document.querySelectorAll<HTMLElement>('[data-port][data-dir="in"]')) {
    const [node, port] = el.dataset.port!.split(":");
    const ref = { node, port };
    if (!canConnect(from, ref)) continue;
    const dot = el.querySelector<HTMLElement>(".port-dot") ?? el;
    const r = dot.getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
    if (d <= reach && (!best || d < best.d)) best = { ref, d };
  }
  return best?.ref ?? null;
}

/** The field: the world layer under the chrome, and every way of moving on it. */
export function Canvas() {
  const cam = camera.use();
  const g = graph.use();
  const focus = nav.use((n) => n.focus);
  const arrival = nav.use((n) => n.arrival);
  const motion = ui.use((u) => u.motion);
  const here = childrenOf(g, focus);
  // the move the pointer made, played once: in grows from the card, out settles from the field
  const arriveStyle =
    arrival && motion === "full"
      ? ({ "--ox": `${arrival.x}px`, "--oy": `${arrival.y}px` } as React.CSSProperties)
      : undefined;
  const arriveClass = arriveStyle ? ` arrive-${arrival!.dir}` : "";
  const writing = !!focus;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [live, setLive] = useState<{ a: Point; b: Point } | null>(null);
  /** the right-click menu, where it was asked for */
  const [menu, setMenu] = useState<Menu | null>(null);
  /** a wire let go on the field: what could take it */
  const [offer, setOffer] = useState<{ from: PortRef; at: Point; world: Point } | null>(null);
  const liveType = live && drag.current?.mode === "wire" ? portOf(drag.current.from, "out")?.type : undefined;
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** the node an ⌥-drag would drop into */
  const [into, setInto] = useState<string | null>(null);
  // far out, cards become titles: below 0.4 the map, back above 0.5 — a
  // hysteresis so the threshold never flickers
  const [map, setMap] = useState(false);
  useEffect(() => {
    if (!map && cam.zoom < 0.4) setMap(true);
    else if (map && cam.zoom > 0.5) setMap(false);
  }, [cam.zoom, map]);
  useEffect(() => {
    setMapMode(map);
  }, [map]);
  // the lens: hold L, or the cluster's key, and only what the selection touches stays lit
  const lens = ui.use((u) => u.lens);
  const [lHeld, setLHeld] = useState(false);
  const lensOn = lens || lHeld;
  const lit = useMemo(() => {
    if (!lensOn) return null;
    const set = new Set<string>(g.selection);
    for (const e of Object.values(g.edges)) {
      if (g.selection.includes(e.from.node)) set.add(e.to.node);
      if (g.selection.includes(e.to.node)) set.add(e.from.node);
    }
    return set;
  }, [lensOn, g.selection, g.edges]);

  // the wheel: a trackpad pans, a pinch (ctrlKey) or ⌘-wheel zooms about the pointer
  useEffect(() => {
    const el = ref.current!;
    if (writing) return; // a page scrolls; the wheel is the platform's
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
        zoomAt({ x: e.clientX, y: e.clientY }, camera.get().zoom * factor);
      } else {
        panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [writing]);

  // the keys: space to pan, arrows to nudge, delete to remove, escape to let go
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) {
        // Escape leaves the field; the next one acts on the canvas
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setSpace(true);
      } else if (e.key === "l" && !e.metaKey && !e.ctrlKey && !e.repeat) {
        setLHeld(true);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        // the prompt bar, back at the foot with its text ready
        e.preventDefault();
        showBar();
      } else if (e.key === "Escape") {
        // with a selection, let go; with none, rise out of this workspace
        const s = graph.get();
        if (s.selection.length || s.edgeSelection.length) clearSelection();
        else rise(() => requestAnimationFrame(fitAll));
      } else if (e.key === "Enter") {
        const sel = graph.get().selection;
        if (sel.length === 1) {
          e.preventDefault();
          enter(sel[0], () => requestAnimationFrame(fitAll));
        }
      } else if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        // two selected: the first compatible output of one into the other, in selection order
        const g = graph.get();
        const [a, b] = g.selection.map((id) => g.nodes[id]);
        if (!a || !b) return;
        const pair = (from: typeof a, to: typeof b) => {
          for (const o of KINDS[from.kind].outputs) for (const i of KINDS[to.kind].inputs) if (o.type === i.type && !edgeInto({ node: to.id, port: i.id })) return [{ node: from.id, port: o.id }, { node: to.id, port: i.id }] as const;
          for (const o of KINDS[from.kind].outputs) for (const i of KINDS[to.kind].inputs) if (o.type === i.type) return [{ node: from.id, port: o.id }, { node: to.id, port: i.id }] as const;
          return null;
        };
        const found = pair(a, b) ?? pair(b, a);
        if (found) connect(found[0], found[1]);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelected();
      } else if (e.key.startsWith("Arrow")) {
        const sel = graph.get().selection;
        if (!sel.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        commit("Nudge", () => moveNodes(sel, dx, dy), `nudge:${sel.join(",")}`);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") setSpace(false);
      if (e.key === "l") setLHeld(false);
    };
    const blur = () => (setSpace(false), setLHeld(false));
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const begin = (e: ReactPointerEvent, d: Drag) => {
    drag.current = d;
    ref.current!.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onFieldDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 1 || (e.button === 0 && space)) {
      e.preventDefault();
      begin(e, { mode: "pan", last: { x: e.clientX, y: e.clientY } });
      return;
    }
    if (e.button !== 0) return;
    const additive = e.shiftKey ? graph.get().selection : [];
    if (!e.shiftKey) clearSelection();
    begin(e, { mode: "marquee", start: { x: e.clientX, y: e.clientY }, additive });
  };

  const handlers: NodeHandlers = {
    onOpen(node) {
      enter(node.id, () => requestAnimationFrame(fitAll), { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    },
    onPointerDown(e, node) {
      if (space || e.button === 1) return; // the field pans
      if (e.button !== 0) return;
      e.stopPropagation();
      let sel = graph.get().selection;
      if (e.shiftKey) {
        toggleSelect(node.id);
        sel = graph.get().selection;
        if (!sel.includes(node.id)) return;
      } else if (!sel.includes(node.id)) {
        select([node.id]);
        sel = [node.id];
      }
      const before = journalBegin();
      raise(sel);
      begin(e, { mode: "move", last: { x: e.clientX, y: e.clientY }, ids: sel, before });
    },
    onPortDown(e, portRef, dir) {
      if (space || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const nodes = graph.get().nodes;
      const before = journalBegin();
      if (dir === "out") {
        const a = portPos(nodes[portRef.node], portRef, "out");
        begin(e, { mode: "wire", from: portRef, a, before });
        setLive({ a, b: toWorld(camera.get(), { x: e.clientX, y: e.clientY }) });
      } else {
        // pick the wire up off the input and carry it
        const existing = edgeInto(portRef);
        if (!existing) return;
        disconnectNow(existing.id);
        const a = portPos(nodes[existing.from.node], existing.from, "out");
        begin(e, { mode: "wire", from: existing.from, a, before });
        setLive({ a, b: toWorld(camera.get(), { x: e.clientX, y: e.clientY }) });
      }
    },
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = { x: e.clientX, y: e.clientY };
    if (d.mode === "pan") {
      panBy(p.x - d.last.x, p.y - d.last.y);
      d.last = p;
    } else if (d.mode === "move") {
      const z = camera.get().zoom;
      moveNodes(d.ids, (p.x - d.last.x) / z, (p.y - d.last.y) / z);
      d.last = p;
      // with ⌥ held, the card under the pointer is where this would go
      const target = e.altKey ? nodeAt(p.x, p.y, d.ids) : null;
      if (target !== into) setInto(target);
    } else if (d.mode === "wire") {
      const near = nearestInput(p.x, p.y, d.from);
      const snap = near ? portPos(graph.get().nodes[near.node], near, "in") : null;
      setLive({ a: d.a, b: snap ?? toWorld(camera.get(), p) });
    } else {
      const r = {
        x: Math.min(d.start.x, p.x),
        y: Math.min(d.start.y, p.y),
        w: Math.abs(p.x - d.start.x),
        h: Math.abs(p.y - d.start.y),
      };
      setMarquee(r);
      const c = camera.get();
      const a = toWorld(c, r);
      const b = toWorld(c, { x: r.x + r.w, y: r.y + r.h });
      const world = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      const s = graph.get();
      const hit = childrenOf(s, nav.get().focus).filter((id) => intersects(s.nodes[id], world));
      select([...new Set([...d.additive, ...hit])]);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const id = el?.closest<HTMLElement>("[data-node]")?.dataset.node;
    if (id && !graph.get().selection.includes(id)) select([id]);
    setMenu({ at: { x: e.clientX, y: e.clientY }, world: toWorld(camera.get(), { x: e.clientX, y: e.clientY }), node: id });
  };

  // a double-click enters the node under it — pointer capture retargets the
  // click to the field, so the node is found by hit-test, not by bubbling
  const onDoubleClick = (e: React.MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!el || el.closest("textarea, input, [data-port]")) return;
    const id = el.closest<HTMLElement>("[data-node]")?.dataset.node;
    if (id) {
      const r = el.closest<HTMLElement>("[data-node]")!.getBoundingClientRect();
      enter(id, () => requestAnimationFrame(fitAll), { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur());
    } else if (el.closest(".stage") && !el.closest(".wire-hit")) {
      // empty field: what to put here
      setMenu({ at: { x: e.clientX, y: e.clientY }, world: toWorld(camera.get(), { x: e.clientX, y: e.clientY }) });
    }
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "wire") {
      const near = nearestInput(e.clientX, e.clientY, d.from);
      if (near) {
        connectNow(d.from, near);
        journalEnd(d.before, "Wire");
      } else if (!(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-node]")) {
        // let go on the field: offer what could take this wire, right here
        journalEnd(d.before, "Wire");
        setOffer({ from: d.from, at: { x: e.clientX, y: e.clientY }, world: toWorld(camera.get(), { x: e.clientX, y: e.clientY }) });
      } else {
        journalEnd(d.before, "Wire");
      }
      setLive(null);
    } else if (d.mode === "move") {
      // land on the 8px grid — the world's own — so cards line up without trying
      const g = graph.get();
      for (const id of d.ids) {
        const n = g.nodes[id];
        if (n) moveNodes([id], Math.round(n.x / 8) * 8 - n.x, Math.round(n.y / 8) * 8 - n.y);
      }
      const target = e.altKey ? nodeAt(e.clientX, e.clientY, d.ids) : null;
      if (target) {
        // undo the drag as a drag; the move-into is its own entry
        journalEnd(d.before, "Move");
        moveInto(d.ids, target);
      } else {
        journalEnd(d.before, "Move");
      }
      setInto(null);
    }
    ref.current!.releasePointerCapture(e.pointerId);
    drag.current = null;
    setMarquee(null);
    setDragging(false);
  };

  // the dots keep the world's grid: they scale with it, and double when they crowd
  let gap = 24 * cam.zoom;
  while (gap < 14) gap *= 2;
  const cursor = dragging && drag.current?.mode === "pan" ? "grabbing" : space ? "grab" : undefined;

  if (writing) {
    return (
      <div ref={ref} className={`stage reading${arriveClass}`} style={arriveStyle} onAnimationEnd={(e) => e.target === e.currentTarget && clearArrival()}>
        <Doc id={focus!} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`stage${live ? " wiring" : ""}${liveType ? ` wiring-${liveType}` : ""}${map ? " lod-map" : ""}${lensOn ? " lens" : ""}${arriveClass}`}
      style={{
        backgroundSize: `${gap}px ${gap}px`,
        backgroundPosition: `${cam.x + 12 * cam.zoom}px ${cam.y + 12 * cam.zoom}px`,
        cursor,
        ...arriveStyle,
      }}
      onAnimationEnd={(e) => e.target === e.currentTarget && clearArrival()}
      onPointerDown={onFieldDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}>
        <Wires live={live} liveType={liveType} lit={lit} />
        {here.map((id) => (
          <Node key={id} node={g.nodes[id]} selected={g.selection.includes(id)} into={into === id} dim={!!lit && !lit.has(id)} handlers={handlers} />
        ))}
      </div>
      {marquee && (
        <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {offer && (
        <Offer
          offer={offer}
          onClose={() => setOffer(null)}
          onPick={(kind, port) => {
            const n = makeNode(kind, Math.round(offer.world.x + 24), Math.round(offer.world.y - 36), { parent: focus });
            addNode(n);
            connect(offer.from, { node: n.id, port });
            setOffer(null);
          }}
        />
      )}
    </div>
  );
}


/** What could take this wire — every kind with an input of its type — as a
 *  menu where the pointer let go. Pick one and it is made there, wired. */
function Offer({ offer, onClose, onPick }: { offer: { from: PortRef; at: Point }; onClose: () => void; onPick: (kind: NodeKind, port: string) => void }) {
  const type = portOf(offer.from, "out")?.type;
  // one row per kind: its first input of this type
  const options = (Object.values(KINDS) as (typeof KINDS)[NodeKind][])
    .map((k) => {
      const i = k.inputs.find((i) => i.type === type);
      return i ? { kind: k.kind, port: i.id, label: k.title, name: i.name } : null;
    })
    .filter((o): o is NonNullable<typeof o> => !!o);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    const onDown = (e: PointerEvent) => !(e.target as HTMLElement).closest(".offer") && onClose();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);
  const h = 44 + Math.max(1, options.length) * 30;
  const left = Math.min(offer.at.x + 8, window.innerWidth - 240);
  const top = offer.at.y + h > window.innerHeight - 120 ? offer.at.y - h - 8 : offer.at.y - 8;
  return (
    <div className="offer card" style={{ left, top }} role="menu" onPointerDown={(e) => e.stopPropagation()}>
      <div className="list">
        <div className="list-head">
          Take this {type} into
          <button className="con-btn offer-x" aria-label="Close" onClick={onClose}>
            <Icon icon={CloseIcon} size={11} strokeWidth={2.2} />
          </button>
        </div>
        {options.map((o) => (
          <button key={`${o.kind}:${o.port}`} className="list-row" role="menuitem" onClick={() => onPick(o.kind, o.port)}>
            <Icon icon={GLYPH[o.kind]} size={13} strokeWidth={1.8} />
            <span className="list-word">{o.label}</span>
            <span className="list-key">{o.name}</span>
          </button>
        ))}
        {options.length === 0 && <p className="pane-empty">Nothing takes a {type} yet.</p>}
      </div>
    </div>
  );
}