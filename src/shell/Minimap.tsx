import { useRef } from "react";
import { camera, type Rect } from "../canvas/camera";
import { screenRect } from "../canvas/view";
import { graph, bounds, childrenOf } from "../state/graph";
import { nav } from "../state/nav";

const W = 188;
const H = 124;
const PAD = 10;

/** The map: this level seen whole, and where you are looking. Cards are
 *  their role's wash, the view a slab of tint you can take hold of.
 *  Nothing is drawn — tone says what is where. */
export function Minimap() {
  const g = graph.use();
  const focus = nav.use((n) => n.focus);
  const cam = camera.use();
  const box = useRef<HTMLDivElement>(null);
  const here = childrenOf(g, focus).map((id) => g.nodes[id]);
  const b = bounds(here);
  if (!b) return null;

  // the world the map shows: what is here, with air around it
  const world: Rect = { x: b.x - 80, y: b.y - 80, w: b.w + 160, h: b.h + 160 };
  const k = Math.min((W - PAD * 2) / world.w, (H - PAD * 2) / world.h);
  const ox = PAD + (W - PAD * 2 - world.w * k) / 2;
  const oy = PAD + (H - PAD * 2 - world.h * k) / 2;
  const on = (r: Rect) => ({ left: ox + (r.x - world.x) * k, top: oy + (r.y - world.y) * k, width: Math.max(2, r.w * k), height: Math.max(2, r.h * k) });

  // what the window is looking at, in world units
  const s = screenRect();
  const view: Rect = { x: (s.x - cam.x) / cam.zoom, y: (s.y - cam.y) / cam.zoom, w: s.w / cam.zoom, h: s.h / cam.zoom };

  /** put the middle of the view where the pointer is */
  const look = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    const wx = world.x + (e.clientX - r.left - ox) / k;
    const wy = world.y + (e.clientY - r.top - oy) / k;
    camera.set((c) => ({ ...c, x: s.x + s.w / 2 - wx * c.zoom, y: s.y + s.h / 2 - wy * c.zoom }));
  };

  return (
    <div
      ref={box}
      className="minimap card"
      style={{ width: W, height: H }}
      aria-label="The map"
      onPointerDown={(e) => {
        look(e);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* a pointer that is not really there — the look still happened */
        }
      }}
      onPointerMove={(e) => e.buttons === 1 && look(e)}
    >
      {here.map((n) => (
        <span key={n.id} className={`minimap-node k-${n.kind}${g.selection.includes(n.id) ? " on" : ""}`} style={on(n)} />
      ))}
      <span className="minimap-view" style={on(view)} />
    </div>
  );
}
