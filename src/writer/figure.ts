/**
 * A figure in the words, drawn (PLAN.md M5.4): the picture, its caption
 * under it — written in place — and, when it is chosen, what it shows for
 * someone who cannot see it and where it goes when the book is set. The
 * block itself is the schema's `figure`; this is only how it looks and is
 * edited. Read-only, the caption is words and nothing else shows.
 */
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { assets, thumbFor } from "../state/assets";

const PLACES: { id: string; word: string }[] = [
  { id: "inline", word: "In the text" },
  { id: "page", word: "A page of its own" },
  { id: "opener", word: "Chapter opener" },
];

export class FigureView implements NodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;
  private caption: HTMLElement;
  private alt?: HTMLInputElement;
  private places?: HTMLElement;
  private off: () => void;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    const editable = view.editable;
    this.dom = document.createElement("figure");
    this.dom.contentEditable = "false";
    this.img = document.createElement("img");
    this.img.draggable = false;
    const well = document.createElement("div");
    well.className = "figure-well";
    well.append(this.img);
    this.dom.append(well);

    if (editable) {
      const cap = document.createElement("input");
      cap.className = "figure-caption";
      cap.placeholder = "A caption";
      cap.spellcheck = true;
      cap.addEventListener("input", () => this.set({ caption: cap.value }));
      this.caption = cap;
      const foot = document.createElement("div");
      foot.className = "figure-set";
      const alt = document.createElement("input");
      alt.className = "figure-alt";
      alt.placeholder = "What it shows, for someone who cannot see it";
      alt.addEventListener("input", () => this.set({ alt: alt.value }));
      this.alt = alt;
      const places = document.createElement("div");
      places.className = "seg paper-form figure-place";
      places.setAttribute("role", "radiogroup");
      places.setAttribute("aria-label", "Where it goes");
      for (const p of PLACES) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "seg-btn";
        b.textContent = p.word;
        b.dataset.place = p.id;
        b.setAttribute("role", "radio");
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => this.set({ place: p.id }));
        places.append(b);
      }
      this.places = places;
      foot.append(alt, places);
      this.dom.append(cap, foot);
    } else {
      this.caption = document.createElement("figcaption");
      this.dom.append(this.caption);
    }
    this.off = assets.subscribe(() => this.draw());
    this.draw();
  }

  private set(attrs: Record<string, string>) {
    const pos = this.getPos();
    if (pos === undefined) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...attrs }));
  }

  private draw() {
    const a = this.node.attrs;
    this.dom.className = `figure fig-${a.place}`;
    // a project file by its 1024 copy (Rust makes it); anything else as it is
    const url = a.src.startsWith("assets/") ? thumbFor(a.src, 1024) : a.src;
    if (url && this.img.src !== url) this.img.src = url;
    this.img.alt = a.alt || a.caption || "";
    if (this.caption instanceof HTMLInputElement) {
      if (this.caption.value !== a.caption) this.caption.value = a.caption;
    } else this.caption.textContent = a.caption;
    if (this.alt && this.alt.value !== a.alt) this.alt.value = a.alt;
    this.places?.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      const on = b.dataset.place === a.place;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.draw();
    return true;
  }

  selectNode() {
    this.dom.classList.add("chosen");
  }
  deselectNode() {
    this.dom.classList.remove("chosen");
  }
  /** the caption and the settings take their own keys and clicks */
  stopEvent(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || !!t.closest(".figure-place"));
  }
  ignoreMutation() {
    return true;
  }
  destroy() {
    this.off();
  }
}
