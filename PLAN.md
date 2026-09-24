# Doodle — the plan, revised

Written 2026-09-23. This plan **replaces the sequencing** of `Doodle_Implementation_Plan.md` (the long plan). The long plan stays as the reference for its invariants (§4.3, §26.2), its AI permission model (§11.3), its domain vocabulary and its later stages (video, branches, Lab). Where the two disagree about *what comes next* or *what the MVP is*, this one holds. `HANDOFF.md` is the state of the code; this is where it is going.

---

## 0. The MVP, in one sentence

> **I install Doodle from a build, open it like any other Mac app, and write a book in it — with the people, places and objects in it given faces and pictures, made by ChatGPT or by open models running on my own machine — and I trust it with the work.**

Who it is for first: me, daily. Then close friends, with a build they can install. Then X and Reddit. So the MVP has to be something I *live in*, and something I can *hand over* without apologising.

What changed from the long plan's MVP (§3): the reference project is now a **book**, not a short film. Film and manga stay as templates that work; they are not what the MVP is measured by. Image generation is not a storyboard step here — it is how a book's characters, places, objects and scenes are *seen* while it is written. And "install the build" is part of the definition: nothing counts that only works under `pnpm tauri dev`.

Platform: **macOS only** (Apple Silicon). Windows is out of scope until after the friends release.

---

## 1. The MVP acceptance scenario

The MVP is done when this runs, start to finish, on a clean Mac, from an installed build, with no developer tools open:

1. **Install.** Open the `.dmg`, drag Doodle to Applications, open it. No terminal. First run explains what it can use (ChatGPT via Codex, Ollama, local image models) and what it found; everything optional has a working fallback.
2. **Start from material.** Choose *Start a book from material*. Drop in a Markdown outline, a PDF of research notes (one of them scanned), a Word document with a draft chapter, and twenty images from a folder. They land on an **inspiration board** — text clippings and images, grouped, each remembering where it came from.
3. **Build from the board.** Ask the agent to build the book from the board. It proposes the cast, the places, a few objects, a style, and a chapter outline — as ghosts. Keep most, drop some. The draft chapter from the Word document becomes Chapter 1, its words intact.
4. **Write.** Write Chapter 2 in the manuscript: continuous prose, headings, scene breaks, emphasis, a Focus mode that hides everything but the words, a word goal for the day. Select a passage → beat, tied. Find and replace across the book.
5. **Faces.** Give the protagonist a face: generate four candidates locally with FLUX.2, keep one; generate a turnaround and three expressions *of the same person* using it as the reference. Give a place a picture from a board image restyled to the book's look.
6. **Illustrate.** Select a passage in Chapter 2 → *Illustrate*. The picture is made with the people and the place in it looking like themselves (their references ride along), and sits in the chapter as a figure beside the passage.
7. **Touch up.** Brush over a hand that came out wrong; regenerate only that. Upscale the keeper.
8. **The agent reads the book.** Ask: "does anything in Chapter 2 contradict the bible or Chapter 1?" It reads, and answers with specifics and proposals, never edits.
9. **Trust.** Force-quit mid-sentence. Reopen: the last sentence is there. Open *History* and restore yesterday's version of a chapter, the current one kept as a copy.
10. **Out.** Export the book as EPUB and as a typeset PDF, illustrations in place; export the manuscript as `.docx` for a friend who wants to comment in Word.
11. **Hand it over.** Archive the project, send it with the build to a friend; they install, open it, read it, and nothing they need is missing.

Every step has an acceptance test in §6.

---

## 2. Where we are (2026-09-23)

What exists, mapped to the long plan's stages. The work "went sideways" often — the cards, the writer, Visual Electric's and Plumb's ideas, vision, MCP — and most of that sideways work is now load-bearing for the book MVP.

| Area | State | Where |
|---|---|---|
| Shell, window, native menus, panes, palette (⌘K), settings | Built | `src/shell/`, `src-tauri/src/menu.rs` |
| Project on disk: `Name.doodle/` folder, `graph.json`, `assets/`, `backups/`, `jobs.json`; autosave 600 ms; atomic writes; backups ≤1/10 min | Built | `state/doc.ts`, `commands.rs` |
| Archive `.doodlebox` with sha256 manifest, verified before any write | Built, tested | `archive.rs` |
| Undo/redo journal (snapshots, coalesced typing) | Built | `state/history.ts` |
| Recursive canvas: enter/rise, zoom crosses levels, far view, lens, minimap, marquee, snapping, wires with jacks and plugs | Built | `src/canvas/` |
| Outline (Blender-style tree: drag, keyboard, rename) | Built | `shell/Navigator.tsx` |
| Cards in The Soft Machine, "as Apple would" | Built | `app.css`, `canvas/Node.tsx` |
| **Writer**: ProseMirror over words kept as text (Markdown / Fountain), screenplay elements, bubble, block key, `@` tokens, own history; fuzzed round trips | Built, tested | `src/writer/` |
| Beats from a selection, **tied** to their passage (anchors on the plain words) | Built | `state/anchors.ts` |
| Book: chapters of **pages** (350-word sheets), writer paginates, Read mode, Markdown export | Built — *but see decision D1* | `state/graph.ts`, `canvas/Read.tsx` |
| Providers: Mock, Ollama (text), ChatGPT via Codex (text + images) | Built | `src/providers/`, `codex.rs` |
| Codex: newest CLI on the machine wins (`npm i -g @openai/codex@latest`) | Built | `codex.rs find()` |
| Provenance for every output ("Where this came from"), Remix, takes onto the field, looks, frames | Built | `state/prov.ts`, `state/remix.ts`, `graph/looks.ts` |
| Thumbnails 256/512/1024 in Rust, cached in `thumbs/` | Built, tested | `thumbs.rs` |
| **Vision**: character and place pictures go with the words to Codex and vision Ollama models | Built | `jobs.ts`, `codex.rs stage()` |
| **Doodle as an MCP server**: the agent reads the document and proposes (beats, shots, characters, places, drafts) | Built | `mcp.rs`, `agent/tools.ts`, `state/ideas.ts` |
| Installable build, signing, first run, recovery UI, version history, import of documents, inspiration board, local image models, figures in chapters, EPUB/PDF/DOCX export | **Not built** — this plan | |

Long-plan stages, honestly: S0–S4 are done in our own way; **S5 (MVP hardening) is the gap**; S6 (private alpha) is the friends release; S7–S8 are after the MVP.

---

## 3. Decisions that changed, and why

| # | The long plan said | What we did | Why |
|---|---|---|---|
| C1 | Svelte | React 19 + our own stores | Already built; no reason to rewrite. |
| C2 | SQLite for the project | JSON in a folder (`graph.json`) | Human-readable, diffable, trivially archived. **Kept, by benchmark (M1.9, 2026-09-23)**: a 134k-word, 30-chapter book with 400 pictures (1.2 MB `graph.json`) in the release build opens to first paint in 271 ms, saves in 5 ms (serialize 1, write 4), searches in < 1 ms, pans the book level and the far view at 60 fps. Memory: 56 MB app + 423 MB web content — pictures as data URLs; see §7. |
| C3 | ProseMirror JSON is canonical | **Text is canonical** — Markdown for prose, Fountain for screenplay; ProseMirror reads and writes it | Prompts, export, pagination, anchors all read words; Markdown/Fountain are what a model and an export already read. Guarded by fuzz tests (1,000 docs/form/run). |
| C4 | Codex App Server "experimental" | ChatGPT via Codex is the main paid provider | It works: streaming, schemas, vision, images, MCP. |
| C5 | — | **Newest Codex binary wins**; Homebrew cask removed | An older CLI is refused the account's default model ("requires a newer version of Codex"). |
| C6 | Agent tools unspecified | **Doodle is an MCP server**, handed to Codex per thread, tools pre-approved because they only observe and propose | `approvalPolicy: never` refuses unapproved MCP calls; `default_tools_approval_mode: "approve"` per server. The user's `~/.codex/config.toml` is never touched. |
| C7 | Reference project: short film | **Book** | The user's first real project. |
| C8 | One image adapter | Two families: **ChatGPT images** (via Codex) now, **local open models** (FLUX.2, Ideogram 4 via MLX) in M4 | The user wants cutting-edge open models on their own machine. |

### Discoveries worth keeping (the "stray work" taught these)

- **WKWebView** answers `window.confirm` with *no*, at once — use the dialog plugin (`confirmAsk`).
- **CSS `zoom`**, not `transform: scale`, keeps type and hairlines crisp on the canvas; `offsetHeight` is not scaled by it; WebKit rounds text wider at fractional zoom.
- **Flex items with `flex: 1`** ignore `height`: a fixed sheet needs `flex: none`.
- **The `in` animation's `transform`** overrides positional transforms — position with the separate `translate` property.
- **React's development double mount** registers async listeners twice unless the previous one is awaited away (`__doodleMenu`, `__doodleAgent`).
- **Synthetic pointer events** throw on `setPointerCapture` — call it last, in a `try`.
- **Codex app server**: `localImage` input items for pictures; `-i` for `codex exec` (before all other flags); `item/started` carries `turnId`; per-thread `config` accepts `mcp_servers`; approval modes are `auto | prompt | writes | approve`.
- **Markdown round trips** break on adjacent delimiters (`***`) and on delimiters touching spaces — emphasis is written `_x_` (stars only inside a word) and a `tidy` pass keeps spaces outside delimiters. Fuzzing found all of this; keep fuzzing.
- **Driving the real window** by guessed coordinates once ran the queue and spent a ChatGPT image. Screenshot between steps; open things through ⌘K.
- **Machine**: Apple M5 Pro, 48 GB unified memory, 561 GB free. Ollama has `qwen3:14b`, and OCR models `glm-ocr` and `chandra-ocr-2` already installed.

---

## 4. Decisions — **made 2026-09-23**

**Decided:** D1 → the chapter is the manuscript (the recommendation). D2 → **GitHub, no Apple Developer account**: builds are published as GitHub Releases for an easy download. D3 → the recommendation: FLUX.2 klein 4B is the default, every model shows its licence. The reasoning each was chosen from is kept below.

**D1 — The unit of writing in a book (decided: the chapter).** Today a book is chapters of 350-word **page nodes**. That was right for the recursive-canvas idea and wrong for writing a book: a writer revises across page boundaries all the time, and 350-word sheets make every edit near a boundary awkward.
- **Recommendation: the chapter is the manuscript** — one continuous document per chapter, with scenes as sections inside it (scene breaks / headings). Pages become a **layout**, computed from the words for the field (the sheets you see when you zoom out), for Read mode and for the PDF — never something you write across. Beats, notes, figures and images stay nodes inside the chapter, tied to passages. Existing books migrate by joining their pages (page breaks kept as soft markers until the first edit).
- Alternative: keep pages as nodes and add a "continuous" editing view that stitches them. More code, more edge cases, the same result.

**D2 — how friends get the app: GitHub Releases (decided).** No Apple Developer Program. CI builds an ad-hoc-signed `.dmg` on every version tag and publishes it as a GitHub Release, with a README install section. The cost of skipping notarization: the first open of a downloaded build is blocked by Gatekeeper; the friend allows it once in *System Settings → Privacy & Security → Open Anyway* (the README shows this with a screenshot; `xattr -dr com.apple.quarantine /Applications/Doodle.app` for the terminal-minded). Updates come through Tauri's updater reading the GitHub Release feed, signed with Doodle's own update key (independent of Apple). A Homebrew tap (`brew install --cask x0bd/tap/doodle`) is an easy extra later. Notarization can still be added if the audience grows past friends.

**D3 — Licences (decided: the recommendation).** FLUX.2 klein **4B is Apache 2.0**; FLUX.2 klein **9B** and **Ideogram 4** are **non-commercial**. Fine for writing your book and showing friends; if the book or Doodle is ever sold, images made with 9B/Ideogram need a commercial licence or regeneration with 4B/ChatGPT. Doodle records the model in every image's provenance, so this is always answerable. Recommendation: default to klein 4B for anything "final", show the licence beside each model.

---

## 5. Architecture going forward

```
┌───────────────────────────── Doodle.app ─────────────────────────────┐
│ Webview (React)                                                      │
│   document state · canvas · writer · board · agent tools (MCP side)  │
│        │ invoke / events                                             │
│ Rust core (Tauri)                                                    │
│   files · archive · thumbs · recovery journal · import (pdf/docx)    │
│   MCP endpoint (127.0.0.1, token) · process supervisor               │
│        │ stdio JSON-RPC            │ HTTP             │ stdio JSON   │
│   codex app-server           Ollama :11434      doodle-imaged        │
│   (ChatGPT text, images,     (text, tools,      (Python + MLX,       │
│    vision, MCP client)        vision, OCR,       mflux: FLUX.2,      │
│                               embeddings)        Ideogram 4, SeedVR2)│
└──────────────────────────────────────────────────────────────────────┘
```

- **doodle-imaged** is a small Python sidecar Doodle owns: installed and updated by Doodle with `uv` into Doodle's Application Support folder (its own environment, never the user's Python), started on demand, speaking JSON lines over stdio like the Codex app server, keeping one model loaded and unloading it when idle. It wraps the **mflux** Python API. Every capability is declared (`generate`, `edit-with-references`, `inpaint`, `upscale`) per model, so the UI only offers what the loaded model can do.
- **The process supervisor** (Rust) starts, health-checks and restarts sidecars, and finds binaries the way a Finder-launched app must (no shell `PATH`): Codex by version (done), Ollama at its known paths, `uv` bundled or downloaded.
- **Everything the agent can do stays observe + propose** (§11.3 of the long plan). New tools join `agent/tools.ts` and reach Codex over MCP and Ollama over its native tool calling.

---

## 6. Milestones

Each milestone ends in something usable. Sizes: **S** ≈ a session, **M** ≈ 2–4 sessions, **L** ≈ a week or more. Every task lists its acceptance test; nothing is done until it passes in the **installed build** (from M1 on), checked in the real window, in both light and dark.

### M1 — A build I can live in (the foundation of trust) — *L* · **v0.2.0 built and installed 2026-09-24**

The point: from here on, Doodle is opened from Applications, and it never loses words.

| # | Task | Acceptance |
|---|---|---|
| M1.1 ✅ | **Release build**: `tauri build`, bundle id `com.x0bd.doodle`, icon set, version from git tag, `.dmg`; ad-hoc signed | Drag to Applications, open, create a book, quit, reopen — works without a terminal. |
| M1.2 ✅ | **Finder-launched environment**: find Codex (done), Ollama, and later `uv`, with no shell `PATH`; a Providers screen that says what was found and why not | Launch from Finder with Ollama and Codex installed: both available; rename one binary: the screen says it is missing and how to fix it. |
| M1.3 ◐ | **A `.doodle` project is a document package** (UTType declared as a package): it shows as one file in Finder, double-click opens it in Doodle, it appears in *Open Recent* | Double-click a project in Finder → Doodle opens it. |
| M1.4 ✅ | **Recovery journal**: every change also appended to `recovery.log` inside the project (write-ahead, fsync ≤ 1 s); on open after a crash, replay and offer *Recovered changes* | `kill -9` mid-typing; reopen: nothing typed more than 1 s before the kill is lost. |
| M1.5 ✅ | **Version history**: a daily snapshot per chapter/node plus on-demand snapshots; *History* shows versions, a diff, and *Restore* (the current kept as a copy) | Restore yesterday's chapter; today's is in *History* too. |
| M1.6 ✅ | **Integrity**: validate `graph.json` against a schema on open; migrations with a `format` version; orphan-asset scan with a dry run | A corrupted file opens from the newest good backup with a plain sentence saying so. |
| M1.7 ✅ | **First run**: welcome that explains providers, detects them, and opens a sample book | A fresh Mac user reaches writing in < 60 s. |
| M1.8 ✅ | **Diagnostics**: local log files (rotated, no text content, no tokens), *Reveal logs*, a redacted diagnostics bundle | A friend can send a bundle that contains no words of their book. |
| M1.9 ✅ | **Scale benchmark** (decision C2): generate a 120k-word, 30-chapter book with 400 images; measure open, save, search, memory | Open < 1 s, save < 50 ms, canvas at 60 fps at the book level; else migrate storage before M2. |
| M1.10 ◐ | **Test harness and releases**: vitest for state (graph ops, anchors, pagination, import), Rust tests, a Playwright smoke against the dev server with mocked `invoke`; GitHub Actions on macOS builds the ad-hoc-signed `.dmg` on every version tag and **publishes it as a GitHub Release** (D2) | CI green; tagging `v0.x.y` produces a Release with a `.dmg` that installs on a second Mac by following the README. |

### M2 — The manuscript (writing a book, properly) — *L*

Built on **D1** (decided: the chapter is the manuscript).

| # | Task | Acceptance |
|---|---|---|
| M2.1 ✅ | **Chapter as manuscript** (D1): one continuous document per chapter; scenes as sections (scene break `* * *` and `##`); migration of existing page-books | Migrate the sample book; no word lost (round-trip test); beats still tied. |
| M2.2 ✅ | **Manuscript view**: the whole book as one scrolling, *editable* column (not only Read): chapter headings, jump list, virtualised so 120k words scroll smoothly | Type in Chapter 12 while scrolled from Chapter 1; 60 fps scroll. |
| M2.3 ✅ | **Pages as layout**: pages computed from the words (for the field's sheets, Read, PDF), never edited as nodes; page numbers stable for a given layout | Zoom out on a chapter: its sheets show; edit a word: the sheets reflow. |
| M2.4 ✅ | **Focus mode**: only the words; typewriter scrolling; dim everything but the paragraph (optional); ⌘⇧F | Toggle in and out without losing caret or scroll. |
| M2.5 ✅ | **Goals and stats**: words today, per chapter, per book; a daily goal; a streak; reading time | Goal ring fills as you write; resets at midnight local. |
| M2.6 ✅ | **Find and replace across the book** with regex, whole word, case; preview of every hit; one journal entry | Replace a name in 40 places, undo in one step. |
| M2.7 ✅ | **Comments** in the margin, tied to passages (anchors); resolve/reopen | A comment survives edits around its passage. |
| M2.8 ✅ | **Spelling and grammar**: macOS spellcheck in the editor (on), a per-book dictionary (character and place names added automatically) | Character names are never flagged. |
| M2.9 ✅ | **Import into chapters** (from M3.1's readers): Markdown, `.docx`, `.fountain`, `.txt` → chapters split at headings | A 30-chapter Markdown file becomes 30 chapters. |

### M3 — Material in: import and the inspiration board — *L*

| # | Task | Acceptance |
|---|---|---|
| M3.1 ✅ | **Readers** (Rust or webview, pure functions, fixture-tested): Markdown, plain text, `.docx` (mammoth-style: headings, emphasis, lists, images), PDF text with page numbers (pdf.js), PDF page images, images (jpg/png/webp/heic), Fountain; later `.pages`, EPUB | Each reader has fixtures with expected output. |
| M3.2 ✅ | **OCR for scanned PDFs and images of text**: detect pages with no text layer, run a local OCR model through Ollama (`glm-ocr` installed; `chandra-ocr-2` as the careful one) | A scanned page becomes text with > 95% word accuracy on the fixture. |
| M3.3 ✅ | **The inspiration board** — a new place kind: a free field of *clippings* (text excerpts, images, whole documents collapsed to a card), groups, notes; every clipping keeps its source (file, page, position) and opens it | Drop 3 files and 20 images; everything lands, grouped by source; click a clipping → its source at that page. |
| M3.4 | **Clip from a document**: open an imported document read-only; select a passage → *Clip to board* | The clip remembers its page. |
| M3.5 | **Start from material**: a welcome choice that makes a book with a board, drops the files onto it, then offers *Build from the board* | Scenario step 2 in < 2 minutes. |
| M3.6 | **Build from the board** (agent): read the board (text + images via vision) → propose cast, places, objects, style (palette/look from the images), chapter outline, bible entries — as ghosts | Scenario step 3; everything kept is linked back to the clippings it came from. |
| M3.7 | **Board → style**: select images → *Make a style from these* (vision describes palette, lighting, medium; the images become the style's references) | The style's references ride into image requests. |
| M3.8 | **Tags** on clippings and nodes; search by tag (long plan §3.3 search) | Filter the board by tag; ⌘K finds by tag. |

### M4 — Local images: FLUX.2 and Ideogram 4 on this Mac — *L*

| # | Task | Acceptance |
|---|---|---|
| M4.1 | **doodle-imaged sidecar**: Python + `mflux` in Doodle's own `uv` environment under Application Support; JSON-lines protocol (`load`, `generate`, `edit`, `inpaint`, `upscale`, `progress`, `cancel`, `unload`); supervised by Rust | Kill it mid-run: Doodle restarts it and marks the job failed with a sentence. |
| M4.2 | **Model manager**: list models with size, licence, capabilities, speed on this Mac; download with progress and resume (`hf_transfer`); gated models (Ideogram 4) explain the licence page and take a Hugging Face token into the **Keychain** | Install FLUX.2 klein 4B from Settings; see it offered to generators. |
| M4.3 | **Models, first set**: FLUX.2 klein 4B (Apache, default), FLUX.2 klein 9B (quality, non-commercial), Ideogram 4 (typography and layout, non-commercial), SeedVR2 (upscale). Later: Qwen Image 2.1, Z-Image | Each generates a 1024² image on the M5 Pro; times recorded in the model list. |
| M4.4 | **Local provider** behind the provider port: progress per step, **real cancel**, one model resident, idle unload after 10 min, memory guard (refuse to load a model that would not fit beside what Ollama holds) | Generate, cancel at step 5 — stops within a second. |
| M4.5 | **Prompt compiler per model**: FLUX.2 natural language with references; Ideogram 4 JSON captions, hex colours, bounding boxes for layout; negative prompts where supported | The same scene prompt produces model-appropriate requests (unit-tested). |
| M4.6 | **References and editing** (FLUX.2 multi-reference): character and place pictures as references; "same person, new pose"; edit an image with words | Four images of a character from one reference are recognisably the same person (manual check with a rubric). |
| M4.7 | **Touch-up brush** (inpaint): paint a mask over an image, words for the change, regenerate only the mask | Fix a hand; the rest of the image is byte-for-byte unchanged outside the mask's feather. |
| M4.8 | **Upscale** (SeedVR2) of any take, 2× and 4× | A kept take upscales to 2048² in the background. |
| M4.9 | **Queue that survives**: persisted local jobs resume after relaunch (local runs can resume; ChatGPT ones are marked and retried on request) | Quit mid-run, reopen: the job continues. |
| M4.10 | **Provenance** records model, quantisation, steps, seed, references and licence | *Where this came from* shows "FLUX.2 klein 9B · non-commercial". |

### M5 — Pictures in the book — *L*

| # | Task | Acceptance |
|---|---|---|
| M5.1 | **Character sheet**: face, turnaround (front/¾/profile), expressions, outfit variants — generated as a *set* from the chosen face as reference; a gallery; one picture is *the* face | Scenario step 5. |
| M5.2 | **Objects** — a new kind for things that matter in the story (the manifest, the lamp, the key): description, pictures, where they appear | An object mentioned with `@` rides into requests with its picture. |
| M5.3 | **Illustrate a passage**: select words → *Illustrate*; the request carries who and where appear in the passage (mentions + the chapter's cast) and their references; results appear as takes beside the passage | Scenario step 6. |
| M5.4 | **Figures in the manuscript**: a figure block (image, caption, alt text) anchored to a passage; placement (inline, full page, chapter opener); in Markdown as `![caption](assets/…)` | Figures survive the round trip and export. |
| M5.5 | **Book style lock**: a book-level look (style + reference images + model + settings) applied to every picture unless overridden | Switch the lock: new pictures follow it. |
| M5.6 | **Continuity of looks**: when a character's face changes, pictures made from the old one are flagged *made from an earlier face* with *Remake* | Change a face; old figures show the flag. |

### M6 — The agent reads the book — *M*

| # | Task | Acceptance |
|---|---|---|
| M6.1 | **Tools for Ollama** through `/api/chat` tool calling (qwen3); the same `TOOLS` as Codex | A free ask on Ollama proposes beats through tools. |
| M6.2 | **Long-book context**: chapter summaries kept fresh in the background; local embeddings (Ollama embedding model) over passages; `doodle_search_meaning` tool | "Where did Mara first see the ship?" finds the passage in a 120k-word book. |
| M6.3 | **Continuity check**: against the bible, character sheets and earlier chapters; answers with quotes and proposals | Scenario step 8 catches a planted contradiction. |
| M6.4 | **More tools, still propose-only**: `propose_illustration` (a passage + a prompt, becomes takes on keep), `propose_object`, `propose_bible`, `propose_comment` | The agent can suggest an illustration; nothing is generated until kept. |
| M6.5 | **Agent on the field bar** as well as on a page (the whole book or the selection as scope) | Ask from the book level about the book. |

### M7 — Out: export and a friend-ready build — *M*

| # | Task | Acceptance |
|---|---|---|
| M7.1 | **EPUB 3** export with figures, chapter navigation, cover, metadata | Validates with epubcheck; opens in Apple Books. |
| M7.2 | **Typeset PDF** via Typst (embedded): book trim sizes, chapter openers, figures, page numbers, a few designed templates | A 300-page PDF in < 20 s that looks like a book. |
| M7.3 | **`.docx`** export (manuscript format: 12pt, double-spaced option, scene breaks) | Opens in Word and Pages with headings intact. |
| M7.4 | **Share a project**: archive + a *read-only reader mode* for someone without the providers | A friend opens the archive and reads with pictures. |
| M7.5 | **Friend-ready distribution** (D2): GitHub Releases with the `.dmg`, README install steps including the one-time *Open Anyway*, Tauri updater on the Release feed with its own signing key, release notes per version; optional Homebrew tap | A friend installs from the Release page by following the README alone, and gets the next version through the updater. |
| M7.6 | **Onboarding and help**: the sample book, a 5-minute tour, shortcuts sheet (exists), providers and privacy page, known limitations | A friend gets from install to a picture of their character without asking me. |

### M8 — Friends release (private alpha), then launch prep — *M*

| # | Task | Acceptance |
|---|---|---|
| M8.1 | **Soak**: 2-hour scripted session (edits, navigation, generations, imports) with memory and crash tracking | No crash; memory flat after warm-up. |
| M8.2 | **Accessibility and polish pass**: keyboard-only through the scenario, VoiceOver smoke, reduced motion, 200% text | The scenario is doable without a mouse. |
| M8.3 | **Feedback loop**: in-app *Send feedback* that makes an email with the diagnostics bundle attached (opt-in) | A friend's report arrives with what is needed. |
| M8.4 | **Launch kit** for X and Reddit: a landing page, a 60-second screen recording of the scenario, a README, privacy statement, the model licences explained | Ready to post. |

---

## 7. After the MVP (kept, not scheduled)

**Performance, found by M1.9 and not yet needed:** pictures are held as data URLs in the page (423 MB of web content for the benchmark book) — serve them through a custom protocol so WebKit keeps and drops decoded images itself; draw only the cards in view at a level with hundreds of cards; send `graph.json` to Rust as raw bytes rather than a JSON string (the write is 4 ms now).


From the long plan and the stray work: **video** (image-to-video from a chosen take; a mock adapter first), **branches** (explore a chapter as a variant, compare, promote), **recipes** (Plumb: a graph used as a form), structured multi-output steps, `{{port}}` placeholders, prompt suggestions from your own kept prompts (Visual Electric), Windows, collaboration, Claude via API key, Doodle Lab.

---

## 8. Risks

| Risk | Likelihood | What we do |
|---|---|---|
| Un-notarized downloads are blocked on first open (D2) | Certain | README step with a screenshot; the Release notes repeat it; notarize later if the audience grows. |
| D1 migration loses words | Medium | Round-trip fuzz tests on the migration; keep the old pages in `backups/` until the user says otherwise. |
| mflux churns (new models, API changes) | High | Pin the mflux version in the sidecar environment; upgrade deliberately; the capability declaration isolates the UI. |
| Memory: FLUX.2 9B + qwen3 14B + the app on 48 GB | Medium | Memory guard in M4.4; unload idle models; prefer klein 4B while Ollama is busy. |
| Gated models (Ideogram 4) need a Hugging Face account and licence acceptance | Certain | A clear guided step; the token in the Keychain; everything else works without it. |
| Codex CLI versions and the account's model | High | Newest-binary rule (done); the Providers screen says the version and warns when it is old. |
| JSON storage at book scale | Low–medium | The M1.9 benchmark decides before M2. |
| Scope: every milestone is *L* | Certain | Ship each milestone into the installed build; the scenario list is the scope — anything not needed by §1 waits for §7. |

---

## 9. Order, and what starts now

**M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8**, with two overlaps allowed: M4.1–M4.3 (the image sidecar) can start alongside M2 because they touch different code; M6.1 (Ollama tools) is small and can ride along anywhere.

Start: **M1.1–M1.3** (a build you can open from Applications — M1.1, M1.2 done 2026-09-23; M1.3 built, the type registers as a package, the double-click not yet checked in the installed build; CI workflows written, no tag pushed yet), then M1.4 (the recovery journal — done 2026-09-23), M1.5 (versions), M1.6 (integrity) and the M1.9 benchmark — done 2026-09-23 (JSON stays; the field was re-rendering every card on every frame of a pan, fixed), then and M1.10 (CI publishing to GitHub Releases). D1–D3 are decided (§4).
