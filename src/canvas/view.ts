/**
 * The view actions the chrome and the menu share: step the zoom about the
 * centre of the field, frame everything, go to 1:1.
 */
import { camera, fitRect, zoomAt, zoomStep, type Point, type Rect } from "./camera";
import { bounds, graph, childrenOf } from "../state/graph";
import { nav } from "../state/nav";

import { ui } from "../state/ui";

/** the field is the whole window; the chrome floats on it — but a fit
 *  should land between the panes, under the head, above the bar */
export function screenRect(): Rect {
  const { navigator, inspector } = ui.get();
  let left = navigator ? 18 + 216 + 18 : 0;
  let right = inspector ? 18 + 264 + 18 : 0;
  // in a narrow window the panes cover the field anyway; frame the whole of it
  if (window.innerWidth - left - right < 560) left = right = 0;
  return { x: left, y: 60, w: window.innerWidth - left - right, h: window.innerHeight - 60 - 120 };
}
export const screenCentre = (): Point => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

export const zoomIn = () => zoomStep(1, screenCentre());
export const zoomOut = () => zoomStep(-1, screenCentre());
export const zoomActual = () => zoomAt(screenCentre(), 1);

export function fitAll() {
  const g = graph.get();
  const focus = nav.get().focus;
  const ids = g.selection.length ? g.selection : childrenOf(g, focus);
  const rects: Rect[] = ids.map((id) => g.nodes[id]).filter(Boolean);
  const b = bounds(rects);
  if (b) fitRect(b, screenRect(), 120);
}

/** the camera store, for the figure in the cluster */
export { camera };
