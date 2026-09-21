import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { camera, panBy, toWorld, zoomAt, type Point, type Rect } from "./camera";
import {
  graph, clearSelection, select, toggleSelect, moveNodes, raise, intersects, deleteSelected,
  connectNow, canConnect, disconnectNow, edgeInto, moveInto, type PortRef,
} from "../state/graph";
import { begin as journalBegin, end as journalEnd, commit, type Snapshot } from "../state/history";
import { Node, type NodeHandlers } from "./Node";
import { nav, enter, rise, clearArrival } from "../state/nav";
import { ui } from "../state/ui";
import { childrenOf } from "../state/graph";
import { fitAll } from "./view";
import { Wires } from "./Wires";
import { Workspace } from "./Workspace";
import { Writer, WRITER_KINDS } from "./Writer";
import { portPos } from "./layout";

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

/** The port under a screen point, if any. */
function portAt(x: number, y: number): { ref: PortRef; dir: "in" | "out" } | null {
  const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-port]");
  if (!el) return null;
  const [node, port] = el.dataset.port!.split(":");
  return { ref: { node, port }, dir: el.dataset.dir as "in" | "out" };
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
  const writing = !!focus && WRITER_KINDS.has(g.nodes[focus]?.kind);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [live, setLive] = useState<{ a: Point; b: Point } | null>(null);
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** the node an ⌥-drag would drop into */
  const [into, setInto] = useState<string | null>(null);

  // the wheel: a trackpad pans, a pinch (ctrlKey) or ⌘-wheel zooms about the pointer
  useEffect(() => {
    const el = ref.current!;
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
  }, []);

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
    };
    const blur = () => setSpace(false);
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
      const hit = portAt(p.x, p.y);
      const snap = hit && hit.dir === "in" && canConnect(d.from, hit.ref) ? portPos(graph.get().nodes[hit.ref.node], hit.ref, "in") : null;
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
    }
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "wire") {
      const hit = portAt(e.clientX, e.clientY);
      if (hit && hit.dir === "in") connectNow(d.from, hit.ref);
      setLive(null);
      journalEnd(d.before, "Wire");
    } else if (d.mode === "move") {
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
      <div ref={ref} className={`field doc${arriveClass}`} style={arriveStyle} onAnimationEnd={(e) => e.target === e.currentTarget && clearArrival()}>
        <Writer id={focus!} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`field${live ? " wiring" : ""}${arriveClass}`}
      style={{
        backgroundSize: `${gap}px ${gap}px`,
        backgroundPosition: `${cam.x + 12 * cam.zoom}px ${cam.y + 12 * cam.zoom}px`,
        cursor,
        ...arriveStyle,
      }}
      onAnimationEnd={(e) => e.target === e.currentTarget && clearArrival()}
      onPointerDown={onFieldDown}
      onDoubleClick={onDoubleClick}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}>
        {focus && <Workspace id={focus} />}
        <Wires live={live} />
        {here.map((id) => (
          <Node key={id} node={g.nodes[id]} selected={g.selection.includes(id)} into={into === id} handlers={handlers} />
        ))}
      </div>
      {marquee && (
        <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
      )}
    </div>
  );
}
