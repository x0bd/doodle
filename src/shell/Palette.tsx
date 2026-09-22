import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, SearchIcon, RunIcon, PlusIcon, SettingsIcon, FitIcon, PageIcon, SaveIcon } from "../icons";
import { graph, select } from "../state/graph";
import { nav, enter, riseTo } from "../state/nav";
import { fitRect } from "../canvas/camera";
import { screenRect, fitAll } from "../canvas/view";
import { ui, closePalette, openChooser, openSettings, showBar } from "../state/ui";
import { enqueue } from "../state/jobs";
import { exportText, exportArchiveFile, importArchiveFile } from "../state/doc";
import { GLYPH } from "../canvas/Doc";
import { KINDS } from "../graph/kinds";
import type { GraphNode } from "../state/graph";

type Hit = { kind: "node"; node: GraphNode; where: string } | { kind: "cmd"; id: string; label: string; icon: typeof RunIcon; run: () => void };

/** ⌘K: every node by name, kind or words; the few commands that matter.
 *  Enter selects and frames; ⌘Enter opens the page. */
export function Palette() {
  const open = ui.use((s) => s.palette);
  const g = graph.use();
  const [q, setQ] = useState("");
  const [hl, setHl] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setHl(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    const all: Hit[] = [
      { kind: "cmd", id: "run", label: "Run the graph", icon: RunIcon, run: () => enqueue() },
      { kind: "cmd", id: "new", label: "New graph…", icon: PlusIcon, run: openChooser },
      { kind: "cmd", id: "fit", label: "Fit to view", icon: FitIcon, run: fitAll },
      { kind: "cmd", id: "bar", label: "The prompt bar", icon: RunIcon, run: showBar },
      { kind: "cmd", id: "export", label: "Export as Markdown…", icon: PageIcon, run: () => void exportText() },
      { kind: "cmd", id: "archive", label: "Archive project…", icon: SaveIcon, run: () => void exportArchiveFile() },
      { kind: "cmd", id: "unarchive", label: "Open archive…", icon: SaveIcon, run: () => void importArchiveFile() },
      { kind: "cmd", id: "settings", label: "Settings…", icon: SettingsIcon, run: openSettings },
    ];
    const cmds = all.filter((c) => c.kind === "cmd" && (!needle || c.label.toLowerCase().includes(needle)));
    const nodes: Hit[] = g.order
      .map((id) => g.nodes[id])
      .filter((n) => {
        if (!needle) return true;
        const words = `${n.title} ${KINDS[n.kind].title} ${n.data.text ?? ""} ${n.data.description ?? ""} ${n.data.name ?? ""}`.toLowerCase();
        return words.includes(needle);
      })
      .sort((a, b) => {
        const ta = a.title.toLowerCase().startsWith(needle) ? 0 : 1;
        const tb = b.title.toLowerCase().startsWith(needle) ? 0 : 1;
        return ta - tb || a.seq - b.seq;
      })
      .slice(0, 12)
      .map((n) => ({ kind: "node", node: n, where: n.parent ? (g.nodes[n.parent]?.title ?? "") : "" }));
    return needle ? [...nodes, ...cmds] : [...cmds, ...nodes];
  }, [q, g]);

  useEffect(() => setHl(0), [q]);

  if (!open) return null;

  const go = (h: Hit, page: boolean) => {
    closePalette();
    if (h.kind === "cmd") return h.run();
    const n = h.node;
    if (page) {
      enter(n.id);
      return;
    }
    if (nav.get().focus !== n.parent) riseTo(n.parent);
    select([n.id]);
    fitRect(n, screenRect(), 200);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setHl((h) => Math.min(hits.length - 1, h + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setHl((h) => Math.max(0, h - 1)));
    else if (e.key === "Enter") (e.preventDefault(), hits[hl] && go(hits[hl], e.metaKey || e.ctrlKey));
    else if (e.key === "Escape") (e.preventDefault(), closePalette());
  };

  return (
    <div className="veil pal-veil">
      <button className="veil-hit" onClick={closePalette} aria-label="Close" tabIndex={-1} />
      <div className="pal con" role="dialog" aria-label="Search">
        <div className="pal-in">
          <Icon icon={SearchIcon} size={16} strokeWidth={2} />
          <input ref={input} className="pal-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="A node, a word, a command" spellCheck={false} />
          <span className="pal-hint px">↩ go · ⌘↩ open</span>
        </div>
        <div className="pal-list list">
          {hits.length === 0 && <p className="pane-empty">Nothing by that name.</p>}
          {hits.map((h, i) =>
            h.kind === "cmd" ? (
              <button key={h.id} className={`list-row${i === hl ? " hl" : ""}`} onMouseEnter={() => setHl(i)} onClick={() => go(h, false)}>
                <Icon icon={h.icon} size={14} strokeWidth={1.8} />
                <span className="list-word">{h.label}</span>
                <span className="list-key">command</span>
              </button>
            ) : (
              <button key={h.node.id} className={`list-row${i === hl ? " hl" : ""}`} onMouseEnter={() => setHl(i)} onClick={(e) => go(h, e.metaKey)}>
                <Icon icon={GLYPH[h.node.kind]} size={14} strokeWidth={1.8} />
                <span className="list-word">{h.node.title}</span>
                <span className="list-key">{h.where ? `in ${h.where}` : KINDS[h.node.kind].title}</span>
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
