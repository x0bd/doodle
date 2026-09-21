/**
 * The camera: where the world sits on the screen. screen = world × zoom + (x, y).
 * Navigation depth is a different thing (which node has been entered); this
 * is only the view within one workspace.
 */
import { createStore } from "../state/store";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
/** the keys and the menu step through these; the wheel is continuous */
export const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export const camera = createStore<Camera>({ x: 0, y: 0, zoom: 1 });

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export function panBy(dx: number, dy: number) {
  camera.set((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
}

/** Zoom so that the world point under `at` (screen px) stays under it. */
export function zoomAt(at: Point, next: number) {
  camera.set((c) => {
    const z = clampZoom(next);
    const k = z / c.zoom;
    return { zoom: z, x: at.x - (at.x - c.x) * k, y: at.y - (at.y - c.y) * k };
  });
}

export function zoomStep(dir: 1 | -1, at: Point) {
  const z = camera.get().zoom;
  const next =
    dir > 0
      ? (ZOOM_STEPS.find((s) => s > z + 1e-6) ?? ZOOM_MAX)
      : ([...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6) ?? ZOOM_MIN);
  zoomAt(at, next);
}

/** Frame a world rect in a screen rect with some air around it. */
export function fitRect(world: Rect, screen: Rect, pad = 64) {
  if (world.w <= 0 || world.h <= 0) return;
  const z = clampZoom(Math.min((screen.w - pad * 2) / world.w, (screen.h - pad * 2) / world.h, 1.5));
  camera.set({
    zoom: z,
    x: screen.x + (screen.w - world.w * z) / 2 - world.x * z,
    y: screen.y + (screen.h - world.h * z) / 2 - world.y * z,
  });
}

export const toWorld = (c: Camera, p: Point): Point => ({ x: (p.x - c.x) / c.zoom, y: (p.y - c.y) / c.zoom });
export const toScreen = (c: Camera, p: Point): Point => ({ x: p.x * c.zoom + c.x, y: p.y * c.zoom + c.y });
