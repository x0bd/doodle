# The Soft Machine

A design system. **Eased corners and capsule controls, surgical white and deep
black, one face that reads and one that reports, one colour and it is always
a ground — and not a single drawn line.** Built with the platform it
runs on rather than over it.

This is the definitive edition. It is the distillation of four earlier
documents — v1 (the layout), v2 (the typography), *Absolute* (the two fused,
with the line removed) — and of the first application built on it, where the
system met a real operating system and had to give up its costume. What
survived that is here. What did not is listed in §10, with the reason.

It is written to be **lifted into a project by someone who has never seen it**:
§1 is why, §2–§7 are everything you paste, §8–§11 are the laws, §12 is the
order to do it in.

**Source of truth is `soft-machine.css`, beside this file.** If the two
disagree, the stylesheet wins and this document is stale. `fonts/` holds the
three faces; nothing here needs a network request.

---

## 0 · What this is, in one screen

A page is a **ground**. Things that hold content are cut *into* it (a slot) or
stand *on* it (an object); which one is a fact about the thing, and it is said
with tone and with light, never with a line. Controls are **capsules** with a
lit lip and a shaded underside, and they go *in* when pressed. Text is set in
**Inter**; the figures that are data are set in **Geist Mono**; the machine's
own mark is set in **Silkscreen** and nothing else is. Emphasis is
**inversion** — a slab of ink with the page knocked out of it — and it is
rare. Everything that is merely *here* or *chosen* wears a **tint**, a wash of
ink thin enough to sit on any surface. There is **one colour** — the yellow
by default, charcoal for an app that wants none, or the app's own — and it is
always a ground for ink, never ink itself. Everything moves by fading.
Nothing pulses.

On a desktop, the window's own chrome — its lights, its corners, its
scrollbars, its title-bar drag — is **the operating system's**, and the system
lays itself out around it rather than drawing its own.

---

## 1 · The doctrine

Ten rules. Everything else is a consequence of one of them.

### 1 · Nothing is drawn

**There are no frames, no boxes, and no rules.** Not a border, not a hairline,
not a divider between two rows, not a line running out of a section head, not
a structural rule under the machine's name. None.

> Reaching for a **box** → reach for a surface.
> Reaching for a **seam** → reach for more distance.

Every line ever drawn in the earlier systems was covering for a gap that was
too small, and a page carrying eight of them reads as a form regardless of how
defensible each one was alone. A shape is separated from the page by **tone
and by light** — §6 is the part of this rule that took the longest to get
right.

**The one exception, and it is not a loophole: a control may have an edge.
Content may not.** A control has to answer "can I press this?" before it is
pressed. Content never has to answer that question — it announces itself by
being read. That is a real difference in job, and it is the only thing in this
system allowed to trace a shape: `--rim-edge`, on controls and on the panels
that hold them, and nowhere else.

The lint is one line, and it should return nothing:

```
grep -rn "border[a-z-]*:" src/ | grep -v border-radius | grep -v "border: 0"
```

### 2 · Soft machine

Corners are eased, not fat — **6px for a row, 12px for a panel, 8px for a
photograph** — with the **full capsule on every control** and the disc kept for
the mark. A sharp corner reads as precision only when it has lines to agree
with; take the line out and it reads as a system that could not afford a
radius. The capsule is the single most recognisable shape here and it goes on
every control, because a control should stay legible as a control.

### 3 · Ma (間)

Emptiness is the primary material, and it is never centred padding. Weight
sits against one edge and the void opens opposite. The page should feel
underfilled.

> Ship fewer elements than feel done.

**Pick the step by what the gap MEANS** and let the pixels follow — that is
what the semantic `--gap-*` scale is for. With the line gone this is the
**only** grouping device the system has, which makes choosing correctly the
whole job rather than a detail of it.

### 4 · Mono no aware (物の哀れ)

Things fade rather than arrive. Nothing pulses, nothing blinks, nothing
demands. Readouts are honest that the moment they describe has already passed.

### 5 · Ink is absolute, and rare

Surgical white and deep black. Not `#fff` and not `#000` — one degree off
each, because `#fff` is a lamp and `#000` is a hole — but at full strength,
with no warmth doing the softening. The softness is entirely structural: eased
corners, capsule controls, leading and air. **That is precisely what lets the
palette go this hard.**

Emphasis is **inversion** — a slab or a disc of ink with type knocked out of
it — and it is spent on things that are *important*: a progress bar, a
selection on a wall of pictures, a warning, the one primary action. **A chosen
option is not an emphasis. It is a fact.** A hovered row, a checked item, a
toggle that is on, the current section in a rail — these wear the **tint**
(§2), never the ink. This is the rule the first application taught: a list
whose current row is a black slab reads as a terminal theme, and the platform
never does it.

### 6 · Every mark is true

No serials, no registration marks, no barcodes, no coordinates, no glyphs
earning their place by looking technical.

> **Every mark must be something you can read, and every figure must be
> TRUE** — read off the data, never typed.

A mode switch says a word or shows a picture of the mode; it does not draw an
unlabelled square. **Icons are under the same rule**: an icon standing alone
has to be learned, so an icon goes *beside* a word, or stands in at a size
where type would be unreadable, or marks a row in a dense list — and it comes
from one set (Hugeicons, stroke), imported by its *job* so a swap is one line.

### 7 · Inter reads, mono reports, Silkscreen marks

**Inter sets everything that can be read** — every label, every sentence,
every control, sentence case, at 13px for the body and 11–12px for the small
voices. **Geist Mono sets data only**: filenames, paths, dimensions, hashes,
figures in a ledger — tabular, weight 500. **Silkscreen sets the mark**: the
icon, the About tile, the wordmark. Never a sentence, never a label, never a
figure that is data, never a size off the 8px grid, and in an application it
appears once.

This is the rule that changed most between *Absolute* and here. *Absolute* set
everything in mono and reported in uppercase tracked micro labels. The moment
it was placed beside the platform's own windows it read as a costume — a
terminal theme wearing rounded corners. **Uppercase tracked labels, mono
sentences, inked head bars and a pixel face on headings are all retired.** A
group is named in sentence case, small and faint, the way the platform names
Favourites. What is left of the reporting voice is `.lbl`, for a field's label
and a strip's fields, and it is rare.

### 8 · One signal, and it is a ground

A project carries **one** signal colour, `--signal`, chosen once per
application. There are two house defaults, and an app may define its own:

| Signal | Value | When |
| --- | --- | --- |
| **The yellow** | `#ffb347` | the default. Derived from the work, a warm ground for ink |
| **Charcoal** | `= --ink` | an app that wants no colour at all — the live mark becomes an inked disc with the page burning through it |
| *An app's own* | one value | a tool with a colour of its own. One value, both modes, and it must pass §7 |

Whichever it is, it is **always a ground and never ink**: type sits *on* it,
it never *is* type. It keeps one value in both modes. It marks **state**
(live, current, failed) and **consequence** (the one irreversible control),
it may repeat within one kind of thing, and it may never take a third meaning
on one screen. If it means two things, it means nothing. Errors are ink and a
word, not a second colour. The window's traffic lights are not the signal;
leave them as the platform draws them.

### 9 · One break

The system is deliberately monotonous, and that monotony is a budget that buys
**exactly one** expressive moment per screen: the double-rimmed keycap on the
one control that matters, the disc on a cover. Two breaks is noise.

### 10 · The platform is not the enemy

Built for a desktop, the system draws **nothing the operating system already
draws**. The window's lights, its rounded corners, its scrollbars and its
title-bar behaviours are the platform's. Menus are laid out the way the
platform's menus are laid out; settings the way its settings are; a list the
way its lists are. The system's job is tone, light, type and air *inside* the
platform's frame — a native app in this system should be mistaken for one
the platform vendor shipped, until someone looks closely at the corners.

---

## 2 · Tokens

Paste the `:root` and `.dark` blocks from `soft-machine.css`. Every value
below is explained; the stylesheet has them all.

### Ground — the ladder

```
--bg:              #f2f2f0    the ground                          dark  #0b0b0a
--surface:         #e7e7e3    a SLOT cut into the page   1.11 ↓          #171715
--surface-raised:  #f8f8f6    an OBJECT sitting on it    1.05 ↑          #222220
--plate:           #fdfdfc    the document, the brightest thing     #2a2a27
--ink:             #0e0e0d    the disc and the slab                 #f2f2f0
```

**Panels recess and only the plate goes brighter.** A surface below the page
is a slot; a surface above it is an object. Under about 1.08:1 a step is a
tint, not an edge — measure it. `--ink` and `--fg` swap meaning between modes
and that is the trick: a disc is `--ink` with `--bg` type in both, and nothing
else in the system has to know which mode it is in.

### Type on the ground

```
--fg:         full ink
--fg-muted:   ink at 72%   (7.4:1)    a note, an icon at rest
--fg-faint:   ink at 58%   (4.6:1)    a group's name, a key hint, a count
```

### The tint — where it is, and which one

```
--tint:    ink at 6%     the pointer is here          dark: page at 7%
--tint-2:  ink at 11%    the keyboard is here;
                         this one is on / chosen      dark: page at 13%
```

A wash, not a fill: it sits on `--surface`, `--surface-raised` and `--plate`
alike. This is what replaced the inked active row.

### The rim — evidence of thickness

```
--rim-lit:    white at 92%   the lip catching the light   dark: white at 7%
--rim-shade:  ink at 9%      the underside falling away   dark: black at 45%
--rim-edge:   ink at 14%     CONTROLS AND PANELS ONLY     dark: white at 11%
--rim-in:     ink at 11%     the well, and the press      dark: black at 55%
--lift:       two shadows, close and soft
--lift-2:     the wide one, for a sheet or a menu
```

A rim is **never one colour**. Lit above and shaded below, or it is a frame.
In dark mode the rim turns over and not symmetrically: white at 92% on
near-black is a stripe, and the shadow has to work harder because there is
less room beneath the surface for it to fall into.

### Faces, scale, tracking

```
--font-ui:    Inter          reads
--font-mono:  Geist Mono     reports data
--font-sys:   Silkscreen     marks

--t-micro  11px   --t-label  12px   --t-body  13px   --t-lead  16px
--t-display  clamp(26px, 4.4vw, 46px)
--w-report 400    --w-mid 500    --w-declare 600
```

Inter tracks at 0. Mono tracks positive below 14px. The chassis face tracks
`0.08em` and steps on the pixel grid — it never clamps.

### Distance — semantic and fluid

```
--gap-tight  8px                    one object, two parts
--gap-near   16px                   siblings
--gap-wide   clamp(26px, 4vh, 44px) a new group begins
--gap-vast   clamp(48px, 9vh, 92px) a new context begins
```

### Corners

```
--r-sm     6px     a row, a small field
--r-card   12px    a panel, a sheet, a menu
--r-ctl    999px   EVERY CONTROL KEEPS THE CAPSULE
--r-pill   999px   the disc and the dot
--r-plate  8px     a photograph
```

### Motion

```
--press 140ms   a control answering a finger
--fast  180ms   a state change
--base  240ms   an entrance, and the mode itself
--ease  cubic-bezier(0.23, 1, 0.32, 1)   ease-out; nothing bounces
```

---

## 3 · Install

1. Copy `soft-machine.css` and `fonts/` in. Fix the three `url()` paths if
   `fonts/` does not sit beside the stylesheet.
2. `.dark` goes on `<html>`; nothing else changes.
3. **Delete every border and every rule in your existing CSS.** This is the
   step that converts a design — everything else is paint.
4. Run the lint from doctrine 1 until it returns nothing.
5. Never style `::-webkit-scrollbar`. Left alone, WebKit draws the platform's
   overlay bar — present while you scroll, gone when you stop — which is the
   only scrollbar that belongs in a native window. (A hand-drawn thumb that
   appears on hover repaints unreliably in WKWebView; it was tried.)

The stylesheet assumes nothing about the framework. It has no Tailwind, no
preprocessor and no build step; it is one file of tokens and classes.

---

## 4 · Primitives

Every screen is built from these, and **not one of them draws a line.**
Defined once, globally, never hand-copied into a component.

### Surfaces

| Class | What it is |
| --- | --- |
| `.card` | an object: brighter than the ground, a lit lip, a shadow under it |
| `.rim` / `.well` | the edge as a primitive — an object, and a recess. The same idea run in opposite directions |
| `.rim-2` | the double rim: lit lip, edge, a sliver of page, a second ring. **The screen's one break** |
| `.con` | the console: a raised, edged panel with a plain head. Every sheet, dialog, inspector and menu is one |
| `.con-head` / `.con-name` / `.con-fig` / `.con-btn` / `.con-word` | its head: the name on the left; figures, a glyph control and a worded control on the right |
| `.disc` | a filled circle with type knocked out. The system's emphasis and its signature shape |
| `.diag` | the hatch — the texture of emptiness. Never behind content |
| `.note` | an empty state: a recessed line of words spanning whatever it is dropped into |

### Controls

| Class | What it is |
| --- | --- |
| `.pill` | **the control.** Fully round, raised, edged; hover inverts; **the press goes IN** — the lip moves to the bottom, an inner shadow appears, the whole thing travels 1px |
| `.pill.on` | the key held down: the press, kept. A tactile toggle that is on |
| `.pill-sm` | the small one, for a set of options |
| `.pill-ink` | inked at rest — a permanent control that reads from across the room. One per screen at most |
| `.pill-quiet` | no surface until addressed; for controls inside a panel |
| `.pill-icon` | a single glyph, quiet, round; on = tint |
| `.seg` / `.seg-btn` | the segmented control: a well with one raised key in it |
| `.chip` | a small flat toggle; on = tint |
| `.inp` | a form input: a well, not a box; focus brightens it to the plate |

### Lists — the platform's menu idiom

| Class | What it is |
| --- | --- |
| `.list` | flat rows in a panel, 1px apart |
| `.list-row` | a row: a leading column, the word, whatever trails. Hover = `--tint`; `.hl` (the keyboard is here) = `--tint-2`; `.on` (chosen) = a check and a heavier word, **never a fill** |
| `.list-check` | the leading column — always there so the words line up, only drawn on the chosen row |
| `.list-word` / `.list-key` | the word, and a key hint or a count trailing it |
| `.list-head` | a group's name: sentence case, 11px, 600, faint |
| `.list-gap` | a separator. It is a gap |

The right-click menu is the reference: the order menu, the import menu, the
palette, the settings rail and the sidebar are all built from these.

### Forms — the platform's settings idiom

| Class | What it is |
| --- | --- |
| `.group` | one recess holding a form's rows, 1px of the panel between them |
| `.group-row` | a name and a note on the left, its control on the right. Nothing lifts under the pointer: a form is read, not pressed |
| `.group-what` / `.group-name` / `.group-note` / `.group-head` | its parts, and the group's name above it |
| `.field` / `.field-row` | the older slot rows, 2px of page between them. Still right for a ledger or a keys list; wrong for a list of choices (use `.list`) |

### Voices and marks

| Class | What it is |
| --- | --- |
| `.px` | the figure: mono, 500, tabular. Every filename, path, dimension |
| `.lbl` | the reporting voice: micro, uppercase, tracked, faint. A field's label. Rare |
| `.badge` | a count in a small tonal pill. In a sidebar prefer a bare figure |
| `.sys` | the chassis: Silkscreen. The mark, once |
| `.sig` | the live mark: one dot, one live thing. Never pulses |
| `.strip` / `.tick` | the technical strip and the dot between its fields. Every field true |
| `.sec` / `.sec-head` | a section is space and a label. Never a rule |
| `.page` / `.page-head` / `.page-title` / `.page-sub` | a scrolling page, weighted left |
| `.in` / `.unfold` | the entrance (fade up) and the popover (grows from its trigger) |

---

## 5 · Patterns — how the primitives compose on a desktop

These are the compositions the first application settled on. They are the
system meeting the platform, and they are as much the system as the tokens.

### The window

A **slot down one edge** (`--surface`) holding navigation, and beside it the
**main pane** — an object (`--bg`, lit lip, lift, 12px corners) with an 8px
margin, its head and its content inside. The platform draws the lights and
the corners; the system leaves room for them and centres every title-bar row
on their centre line. On macOS with an overlay title bar: lights at x 20, the
sidebar's crown 60px tall, the pane's head 44px under its 8px margin, all
centred on y 30. Press to drag, double-press to zoom, on every title-bar row.

### The sidebar

Lights bare on the surface — no well, no shelf — with the fold toggle a quiet
glyph at the far end of the row. Then Search, then the places, then groups
read off the data (collections, tags, sources) with **bare figures** at the
end of each row, not pills. Groups are named in sentence case, small, faint;
the add glyph surfaces when the group is hovered. Rows tint on hover; the
current row is a step up (`--surface-raised`, a lit lip, the small lift).
Folded, it is a rail wide enough that the icon column sits under the middle
light.

### The head of a pane

Where you are, how many things are here, the live readout if something is
happening, and the one door — an edged pill with a plus and a word. Nothing
else. The content's own controls live in a **dock** floating over its foot: a
segmented control for the shape, a slider for the size, a glyph opening the
order-and-filter menu.

### A menu

`.con` with 6px inset, `.list` inside. Check rows for a choice of one; small
pills pressed down (`.pill.on`) for a set of toggles; a gap for a separator;
`.list-head` for a group's name. Grows from its trigger (`.unfold`) or from
the pointer. Hover tints; nothing is inked.

### Settings

A rail of sections down the left of the sheet (`.list-row` with a small
tonal glyph tile each), the section's groups on the right (`.group`), a
segmented control or a pill on every row's right. Appearance is chosen from
two small windows drawn in each mode's own tokens, the chosen one ringed in
ink — a picture of the mode, not a word. About is the mark, the name, the
version, the note, one control.

### Search

One field at the top, 17px, no box around it. Results run under it **on the
same surface** as list rows, grouped with `.list-head`; the keyboard's row
wears `--tint-2`. A preview stands beside them as a recess (`--surface`): the
plate, the name, a key/value list of true figures, one pill.

### A wall of pictures

12px gaps, 8px corners, 16px gutters. **Selection is an ink ring with a 2px
sliver of page inside it** — ink, because selection is important; the sliver,
so the ring reads over any photograph and is unmistakably the system's. Size
is a step into a fixed table of seven cell sizes (110→430px, ~1.25× apart),
never a column count: the same step is the same size in any window, and
stepping it re-pins what you were looking at.

### A preview

The lights, a round × , the name and *n of N*, one edged toolbar. Steps left
and right that fade after four seconds of stillness. **A plate in the
bottom-left corner** carrying what the picture is made of — resolution,
megapixels, bytes, format — and the words it has been given, as tinted chips;
it fades with the steps and lifts above the filmstrip.

### The live mark

`.sig` appears **once** in an application, for the one thing genuinely
happening at this instant. The readout beside it is a sentence and a slim ink
bar, with no capsule of its own — the head it lives in is quiet and it stays
quiet in it.

### The mark, and the icon

The About tile *is* the app icon: a surgical-white tile with the name in
Silkscreen, drawn on the platform's icon grid (824 on 1024) with the system's
own rim and lift. One face, one shape, in the Dock and in the sheet.

---

## 6 · Tone, light and the edge

"The cards look bland and amateur" turned out to have a measurable cause, and
it was not the missing border.

**The ladder was never wide enough.** Tone was handed the entire task of
separating one shape from another when the frame was thrown out, and at
1.05:1 a tint is all it was; in dark mode two rungs were the same hex. Panels
now recess by 1.11 and only the plate goes brighter — going toward white caps
out immediately, going down has room.

**A stroke describes a shape. A rim says the shape has thickness.** A stroke
is a diagram of an object. A rim is what you get when a real surface meets
light: a lit lip along the top, a shaded underside along the bottom. Run it
backwards — light on the far wall — and you have a recess. `.rim` is an
object, `.well` is a slot, and having both is what stops a page of panels
reading as one flat grey mass.

**The press is the point, not the bevel.** A static bevel is a picture of a
button. What makes a control real is what happens under the finger: the lit
lip moves from the top edge to the bottom, an inner shadow appears where the
surface has dropped below the rim, the whole thing travels one pixel down.
The light has not moved; the surface has. A control that *shrinks* on press
is moving away from the finger — it was `scale(0.98)` once, and it was wrong.
A toggle that is on stays down (`.pill.on`).

**The tint is not a surface.** It is ink at 6% or 11% laid over whatever is
there, so a hovered row in a raised menu and a hovered row in a recessed
sidebar are the same idea at the same strength. It never lifts, never has a
rim, never inverts type.

---

## 7 · Colour, measured

The yellow `#ffb347` against the light ground is **1.59:1** and against the
dark ground **11.1:1**. That asymmetry is why it can never be ink: as type on
the light page it vanishes, and giving it a second value for dark mode is two
accents. As a *ground* it is legible in both — `--signal-ink` (deep ink) on it
is 10.8:1 — and it needs no mode check. Set `--signal` and `--signal-ink` once;
`.sig` and anything else that is *live* takes it automatically.

An app defining its own signal runs the same two numbers against both
grounds before deciding. If it clears 4.5:1 on the light ground as type, it
is not a signal in this system's sense — it is a second ink, and it will be
used as one. The signal is meant to be a ground.

---

## 8 · Layout laws

**Spacing is the only grouping device.** Distance first, then a surface.
There is no third step, because the third step was the line. If a surface
seems necessary, the distance is usually wrong.

**Compose off-centre.** Balance a heavy element with more emptiness, not a
second heavy element. Centred layouts are how a page says it had no opinion.
A sheet is the exception: a modal is centred because it is over everything.

**Bind a view to one screen unless it has more to say than one holds.**

**Choosing a shape for a collection:**

| The content | The form |
| --- | --- |
| The imagery **is** the content | a **wall** — even tiles, the piece hung whole |
| Records with a few fields each | a **ledger** — `.field` rows, figures right-aligned in mono |
| Things to choose between | a **list** — `.list`, a check on the chosen one |
| Things to configure | a **group** — `.group`, a control on every row |
| Behaviours, with nothing to photograph | **lines**. A grid of cards standing in advertises pictures that do not exist |

**A tile is a field, not a frame.** The picture hangs whole, `contain` never
`cover`; the caption goes underneath or surfaces on hover, never printed
across the image at rest.

**Every title-bar row is centred on the lights.** Whatever the platform puts
in the corner, the rows beside it share its centre line.

---

## 9 · Motion

`--press` for a control answering a finger, `--fast` for a state change,
`--base` for an entrance and for the mode itself. Ease-out; nothing bounces.

- **Things fade rather than arrive**, and fade rather than vanish. A finished
  readout sits for a beat before it goes.
- **Never animate a keyboard-initiated action.** Arrowing a list is done all
  day; a highlight that catches up to the key reads as lag. Set a flag while
  the keyboard is driving and drop every transition under it.
- **Only transform and opacity.** Never width, height, top, left.
- **Reflow after the first layout only**, so nothing flies in from (0,0).
- **Nothing pulses without cause.** The live mark does not pulse.
- **A loop that settles should stop.**
- `prefers-reduced-motion` and the in-app switch remove movement and keep
  tone. Reduced, not off — you still need to see a row take the tint.

---

## 10 · What was retired, and why

Each of these was in an earlier edition and is not in this one. The reason
matters more than the item.

| Retired | Reason |
| --- | --- |
| Mono as the reading face | Beside the platform's windows it read as a terminal theme. Inter reads; mono reports data |
| Uppercase tracked labels naming groups | Same. A group is named the way the platform names Favourites: sentence case, small, faint |
| Silkscreen on headings, statements, overlays | The chassis voice on a *heading* is a costume. It survives on the mark, once |
| The inked head bar on a console | A black bar naming every panel is eight breaks on one screen. The head is plain; the panel is edged |
| The inked active row | A chosen option is a fact, not an emphasis. It is a check and the tint |
| The inked hover on menus | Hover is *here*, not *important*. It is the tint |
| A lift as selection on a wall | A photograph that comes forward is not visibly selected over a busy wall. It is an ink ring with a sliver of page inside |
| Drawn window lights, drawn window corners | The platform draws better ones and they do the right thing. Leave room, centre on them |
| A drawn scrollbar | Repaints unreliably; the platform's overlay bar is the only one that belongs |
| The badge pill on every sidebar count | Twelve edged pills down a rail is a remote control. A bare figure |
| The column count as the wall's size | Meant a different size in every window and collapsed at the small end. Seven fixed sizes |
| The tick as a 1px upright | It was the last line. It is a dot |
| Warm paper | Once the corners and the leading were doing the softening, the warmth was just age |
| The kanji face | Nothing set in it |

---

## 11 · Failure modes, in the order they happen

| Symptom | Cause |
| --- | --- |
| It looks like a form | There are lines in it. Doctrine 1 — none on content, ever |
| It looks like a terminal theme | Mono is reading, or labels are uppercase, or a head bar is inked. Doctrine 7 |
| Cards look bland, flat, amateur | The tone ladder is too narrow. §6 — under 1.08:1 it is a tint, not an edge |
| A card looks like a sticker | The rim is one colour top and bottom, so it is a frame |
| An object looks inside-out | The rim runs the wrong way. A lit TOP edge is a lip; a lit BOTTOM edge is the far wall of a recess |
| A button looks right and feels dead | A bevel with no press |
| A list feels heavy | Its rows are slots, or its current row is inked. It is `.list`: flat, a check, the tint |
| Everything is grey mush | Not enough tone separation — use `--surface` *and* `--plate`, and let inversion carry emphasis |
| The page feels cluttered | Delete a section rather than tightening it |
| The title sits above or below the lights | The row is not centred on the lights' centre line. Measure the lights, then size the row |
| The lights are not where the config says | The platform's inset is measured from the title bar's depth less the buttons' own inset, not from the lights' top edge. Measure, then set |
| A new class behaves like something else | It collides with a global (`.sec`, `.strip`, `.list` …). Grep before naming |
| The scrollbar is there sometimes and not others | A styled thumb in WKWebView. Unstyle it |
| A thing measured before it was laid out | An effect ran before the element had width. Depend on the measured width, not on mount |
| The one colour has stopped meaning anything | It is marking two different kinds of thing |
| A control does nothing on some breakpoint | Hide it there. A control-shaped thing that does not act is a lie |

### Do not

- draw a line on content. A control or a panel may have an edge; nothing
  else may
- give a rim one colour
- ship a bevel without a press state
- ink an active row, a hovered row, a checked item or a toggle. Ink is for
  emphasis; those are the tint
- set anything but data in mono, anything but the mark in Silkscreen
- name a group in uppercase
- draw the window's lights, corners or scrollbars
- give the signal a second value for dark mode, or set it as type
- add a second colour "just for errors"
- animate anything the keyboard triggered
- use `100vh`
- print where the machine is, a serial, a barcode, a coordinate

**What to change per project:** `--signal` (the yellow, charcoal, or the
app's own), `--bg` / `--ink` if the ground must move, the radii, the icon
set's job names. The
faces do not change; that is what makes two projects on this system read as
one hand.

**What not to change:** no lines, ink for emphasis and the tint for state,
Inter reads and mono reports, the platform's chrome is the platform's, never
animate keyboard actions. Those five are the system.

---

## 12 · Porting it

In order. Do not skip 3.

1. **Install per §3** — the stylesheet, the fonts, `.dark` on `<html>`.
2. **Read §4 once** and build from those classes. Do not copy a primitive
   into a component; extend it there if it needs to differ.
3. **Delete every border and every rule.** Replace each with distance, a
   surface, or nothing. Most turn out to be nothing.
4. **Give the platform its chrome.** Native lights, native corners, native
   scrollbars; measure the lights and centre every title-bar row on them.
5. **Choose a shape per collection** from §8 before building it. A card grid
   is the default instinct and it is usually wrong.
6. **Decide the signal** — the yellow, charcoal, or the app's own — before
   writing any feature that wants a colour.
7. **Walk the failure table** in §11 against the first real screen. Every
   one of those entries was found on a real screen; most of them will be
   waiting on yours.

---

*The Soft Machine · x0bd · this edition 2026-09-21. First built for*
*[Orb](https://github.com/x0bd/orb) *and* signal.*
