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

## Entering, the writer, drafts, assets

A node has a `parent` (`state/nav.ts`: focus, a view per workspace, `enter`/`rise`/`riseTo`, the trail). Double-click or Enter enters; Escape leaves a field, then rises. **Entered, every node is a document** (`canvas/Doc.tsx`): a page with a glyph tile, title and meta; then what it is — prose for prompt/note/page, a character sheet (reference well, name, appearance), a style sheet (look, palette as chips, lighting), a contact sheet of takes plus settings and runs for a generator, the print for a preview, output and settings for a writer, the checkpoint for a model; then **Beats/Notes** — its children as a numbered list written in place, each openable — and **Media**. The sub-canvas no longer appears; children live on the page. The bar is the **ask** on every page (Expand / Continue / Rewrite where there is prose; a free ask everywhere); the answer is a **draft** on the page (`state/drafts.ts`) — Keep appends into the kind's own words (`proseKey`: text, or description for character/style; Replace for rewrite), discard drops it. Nothing the agent says becomes the document on its own. The canvas surface class is `.stage` (`.stage.reading` for a page) — `.field`, `.doc`, `.page`, `.sec` are the system's; check `soft-machine.css` before naming a class.

Assets: `import_asset(dir, path)` hashes and copies into `Name.doodle/assets/<sha>.<ext>`; `read_asset` returns a data URL (the webview never reads disk; no asset protocol scope). `state/assets.ts` caches URLs (`urlFor`), `attachFiles` saves first if the graph has no home, `attachTo` puts refs on a node (first becomes its picture). Dropped files arrive through Tauri's drag-drop event (paths) in `App.tsx`: onto the card under the pointer, else onto the page being written.

⌥-drag a card onto another card to move it inside (it wears the tint while it would).

Runs: a generator has a `Candidates` count (1–4); a job renders that many, each with the next seed along; outputs go to `assets/` through `write_asset` when the graph has a home (else data URLs stay in memory — and in the file, large — until it is saved). They bloom under the generator's rows; the ringed one is the take (`takeOutput`) and flows to what the image feeds. The bar's History key lists recent runs; picking one frames the node and makes that run's first output the take. The mock varies the fixture by seed (flip, tone) so candidates can be told apart. Entering by pointer animates the field (`nav.arrival`); keys never do. Writers and the ask go to Ollama when it is up with a writer-family model (`providers/registry.ts pick/pickAny`), else the mock, and the node says 'mock instead'.

## ChatGPT through Codex

The user's ChatGPT subscription answers through the Codex CLI the way T3 Code drives it: Doodle spawns the CLI, the CLI holds the login. `src-tauri/src/codex.rs` finds the binary (`DOODLE_CODEX`, Homebrew, `/Applications/ChatGPT.app/Contents/Resources/codex`, `~/.local/bin`), reads only `auth_mode` from `~/.codex/auth.json`, and runs `codex exec --ephemeral --skip-git-repo-check -s <sandbox> -C <scratch> -o <file> -` with the prompt on stdin: text in a read-only sandbox, images in a scratch folder under the app cache with the CLI's own `image_generation` tool (stable in 0.155), the newest PNG in the folder taken as the result. `providers/codex.ts` is the provider (`text.generate`, `image.generate`); the Model select's "ChatGPT (Codex)" and the Write select's "ChatGPT (Codex)" route to it; the writer's ask prefers it. Settings › Providers shows who is up. Every call carries Codex's preamble (~10–15k tokens) — scenes and pictures, not keystrokes. Claude would be API-key only (Anthropic's terms on claude.ai login); nothing of that exists yet. Streaming via `codex app-server` (JSON-RPC over stdio) is the next step there; `codex app-server generate-ts` emits the bindings.

## Safety

CSP is set (`tauri.conf.json`: self only; images from self/data/blob; connect to ipc, Ollama; a looser `devCsp` for Vite's HMR). `save_graph` keeps the previous `graph.json` in `backups/` at most once every ten minutes, newest ten. Runs persist beside the graph as `jobs.json` (`save_record`/`load_record`, a fixed name list) and come back on open — anything queued or running at close is marked cancelled, never resumed. On first save, outputs held as data URLs are written into `assets/` and the file holds references.

## The code

```
src/
  app.css               the app on top of soft-machine.css: signal, field, head, panes, foot, bar, node, wires, sheet
  App.tsx               launch: restore the last graph or the template; keys
  canvas/  camera.ts    x, y, zoom; zoomAt, zoomStep (fixed stops), fitRect
           view.ts      zoomIn/Out/Actual, fitAll (selection or all)
           Canvas.tsx   pan (trackpad, space-drag, middle), pinch/⌘-wheel zoom, marquee, move, wire drags, keys; Doc when entered
           Doc.tsx      the document a node becomes when entered
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
- Wires that cross levels (a child wired to something outside) still feed data but are never drawn.
- The mock writer repeats the brief before its paragraph.
- No run history or candidates; no real adapter; no keychain; no assets folder use yet.
- Ollama shows "Not running" both when it is down and when it is up without a writer model; say which.
- Codex image runs cannot be cancelled mid-flight yet (the child is not killed); the job just ignores the result.
- An unexplained early flip of the pane state to off/off happened twice during HMR + process swaps and never on a clean launch; the store key was bumped to `doodle.ui.v1`. If it recurs, log `togglePanes` callers.
