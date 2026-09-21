import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { camera, panBy, toWorld, zoomAt, type Point, type Rect } from "./camera";
import { graph, clearSelection, select, toggleSelect, moveNodes, raise, intersects, type GraphNode } from "../state/graph";
import { Node } from "./Node";
import { fitAll } from "./view";

type Drag =
  | { mode: "pan"; last: Point }
  | { mode: "marquee"; start: Point; additive: string[] }
  | { mode: "move"; last: Point; ids: string[] };

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/** The field: the world layer under the chrome, and every way of moving on it. */
export function Canvas() {
  const cam = camera.use();
  const g = graph.use();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);

  // open framed on the whole graph
  useEffect(() => {
    const id = requestAnimationFrame(fitAll);
    return () => cancelAnimationFrame(id);
  }, []);

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

  // the keys: space to pan, arrows to nudge, escape to let go
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setSpace(true);
      } else if (e.key === "Escape") {
        clearSelection();
      } else if (e.key.startsWith("Arrow")) {
        const sel = graph.get().selection;
        if (!sel.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        moveNodes(sel, dx, dy);
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

  const onNodeDown = (e: ReactPointerEvent, node: GraphNode) => {
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
    raise(sel);
    begin(e, { mode: "move", last: { x: e.clientX, y: e.clientY }, ids: sel });
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
      const hit = graph.get().order.filter((id) => intersects(graph.get().nodes[id], world));
      select([...new Set([...d.additive, ...hit])]);
    }
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    ref.current!.releasePointerCapture(e.pointerId);
    drag.current = null;
    setMarquee(null);
    setDragging(false);
  };

  // the dots keep the world's grid: they scale with it, and double when they crowd
  let gap = 24 * cam.zoom;
  while (gap < 14) gap *= 2;
  const cursor = dragging && drag.current?.mode === "pan" ? "grabbing" : space ? "grab" : undefined;

  return (
    <div
      ref={ref}
      className="field"
      style={{
        backgroundSize: `${gap}px ${gap}px`,
        backgroundPosition: `${cam.x + 12 * cam.zoom}px ${cam.y + 12 * cam.zoom}px`,
        cursor,
      }}
      onPointerDown={onFieldDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}>
        {g.order.map((id) => (
          <Node key={id} node={g.nodes[id]} selected={g.selection.includes(id)} onPointerDown={onNodeDown} />
        ))}
      </div>
      {marquee && (
        <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
      )}
    </div>
  );
}
