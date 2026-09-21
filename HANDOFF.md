# Doodle — handoff

Updated 2026-09-21. Read this, then `../v00v/the-soft-machine.md` for the design system. `Doodle_Implementation_Plan.md` is the long plan; its agent-protocol, CI, Windows and ADR ceremony is ignored — keep its invariants (§4.3, §26.2) and its order of priorities (§35).

## What Doodle is

A recursively zoomable creative document. The first surface is the **image workflow graph** — Model → Prompt / Negative → Image Generator → Preview — from the dark node-graph mockup, translated into The Soft Machine. The plan's "Lab" came first; Studio (scenes, shots, pages) grows out of it. Four base workflows are templates (`src/graph/templates.ts`): **Images, Film, Manga, Book** — each a graph of kinds. File › New (⌘N) opens the chooser; so does an empty launch.

## Decisions

- Vite + React + TypeScript in front of a Tauri 2 crate (not Next, not Svelte). Port 1430 so Orb (1420) can run beside it.
- Our own canvas engine (`src/canvas/`) — no React Flow. A world layer under the chrome, one transform, SVG wires in world units.
- The graph is JSON on disk now (`Name.doodle/graph.json` beside `assets/`); SQLite when objects, relationships and search arrive.
- The work is in-window pills; the boring things are on the native menu bar (`src-tauri/src/menu.rs` → ids → `src/platform/menu.ts`).
- Mock providers first. `src/providers/types.ts` is the port; `mock.ts` is real infrastructure (latency, per-step progress, cancel); `ollama.ts` is shaped for text and pings `localhost:11434`; the registry hands out the mock. A real image adapter behind an API key in the keychain is next in that area.
- Signal is charcoal (`--signal: var(--ink)`). Dark is the default; light must always hold. Icon is **DD** in Silkscreen on a charcoal tile at Adobe proportion (`design/app-icon.png`).

## The window

Overlay title bar, lights at `{20, 32}` so every row in the head centres on y 30 (see Orb's HANDOFF for why). Left to right: the document tab between its chevrons (name + Unsaved / Edited / Saving… / Saved / Save failed), `⋮`, the ink **Queue** pill (count waiting, then percentage), `×` clear, duplicate, `≡` panes. Two panes float as cards at content height — **Navigator** (graphs, nodes; `+` adds a prompt) and **Inspector** (the selection's fields from the kind registry) — toggled by `≡`, View, or Tab when not typing. Foot: gear (settings sheet: Motion, Appearance light/dark/system, About) with the mono readouts `T I N`; the view cluster `fit · reveal · lens │ − 84% +` bottom-right. The prompt bar is a plate at the foot and *is* the positive prompt of the first generator.

## The code

```
src/
  app.css               the app on top of soft-machine.css: signal, field, head, panes, foot, bar, node, wires, sheet
  App.tsx               launch: restore the last graph or the template; keys
  canvas/  camera.ts    x, y, zoom; zoomAt, zoomStep (fixed stops), fitRect
           view.ts      zoomIn/Out/Actual, fitAll (selection or all)
           Canvas.tsx   pan (trackpad, space-drag, middle), pinch/⌘-wheel zoom, marquee, move, wire drags, keys
           Node.tsx     the card by kind; ports on the edges (data-port for hit-testing); progress in the head
           Wires.tsx    one SVG; wire-hit under wire-line; the live wire
           layout.ts    PORTS_TOP 36, PORT_ROW 18 — the CSS and the wires agree here
  graph/   kinds.ts     the registry: model prompt generate preview character style write page
           templates.ts images film manga book
  state/   store.ts     createStore — value, set, subscribe, use (useSyncExternalStore)
           graph.ts     nodes, order (z), edges, selection; journaled mutations; *Now forms for drags
           history.ts   snapshot journal: commit / begin+end; coalesce by key within 1 s; undo, redo
           doc.ts       path, name, dirty, save state; save/saveAs/open/new; autosave 600 ms; restoreLast
           jobs.ts      queue, one job at a time; requestFor / textRequestFor read through the wires
                        (the prompt compiler: scene, then character, then style); result → journal entry
           ui.ts        panes, theme, motion, settings sheet
  providers/ types.ts mock.ts ollama.ts registry.ts fixtures.ts
  platform/ fs.ts (invoke save_graph/load_graph/graph_exists, dialogs) menu.ts (ids → actions; dev keys in a browser)
  shell/   Head Navigator Inspector Foot Bar Settings NewGraph
src-tauri/src/ lib.rs menu.rs commands.rs (atomic write of graph.json)
public/fixtures/black-bear.png   the mock's output and the Preview's default
```

Rules kept: no `border:` anywhere (`grep -rn "border[a-z-]*:" src/ | grep -v border-radius | grep -v "border: 0"` → nothing); `pnpm check` clean; ink only for the selection ring, progress, Queue, the connected port; hover is the tint; keyboard actions never animate.

## Working

`pnpm tauri dev` (first Rust build ~1 min). The webview holds a half-applied HMR sometimes — `touch index.html` forces a full reload. Capture with a script that fronts Doodle and crops its window at 2×, and only when it is frontmost; drive the app read-only; leave file dialogs to the user. `http://localhost:1430` in a plain browser works for pointer testing (⌘ keys are mapped in `devKeys`); the Tauri `listen` error there is harmless.

## Known / next

- Inert: bar's History / Model / Image keys, cluster's reveal and lens, `⋮`, the tab's `‹ ›`, `⋮` and the Queue chevron.
- `Control mode: Random` reseeds; the mock always returns the bear.
- Character nodes have a reference well (the hatch when empty) but no way to put an image in it yet — that needs the assets folder and an import path.
- No run history or candidates; no real adapter; no keychain; no assets folder use yet.
- The Write kind runs through `text.generate`; the mock answers. Its Model select lists Ollama but the registry still hands out the mock — route by the node's choice next.
- An unexplained early flip of the pane state to off/off happened twice during HMR + process swaps and never on a clean launch; the store key was bumped to `doodle.ui.v1`. If it recurs, log `togglePanes` callers.
