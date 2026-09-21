/**
 * The view actions the chrome and the menu share: step the zoom about the
 * centre of the field, frame everything, go to 1:1.
 */
import { camera, fitRect, zoomAt, zoomStep, type Point, type Rect } from "./camera";
import { bounds, graph } from "../state/graph";

/** the field is the whole window; the chrome floats on it */
export const screenRect = (): Rect => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
export const screenCentre = (): Point => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

export const zoomIn = () => zoomStep(1, screenCentre());
export const zoomOut = () => zoomStep(-1, screenCentre());
export const zoomActual = () => zoomAt(screenCentre(), 1);

export function fitAll() {
  const g = graph.get();
  const ids = g.selection.length ? g.selection : g.order;
  const b = bounds(ids.map((id) => g.nodes[id]).filter(Boolean));
  if (b) fitRect(b, screenRect(), 120);
}

/** the camera store, for the figure in the cluster */
export { camera };
