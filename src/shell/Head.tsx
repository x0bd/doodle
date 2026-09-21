import {
  Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CloseIcon,
  MoreIcon,
  RunIcon,
  CopyIcon,
  MenuIcon,
} from "../icons";
import { ui, togglePanes } from "../state/ui";
import { doc } from "../state/doc";
import { jobs, enqueue, clearQueue, pending, current } from "../state/jobs";
import { nav, trail, riseTo } from "../state/nav";
import { graph } from "../state/graph";
import { fitAll } from "../canvas/view";
import { QueueMenu } from "./QueueMenu";
import { useState } from "react";
import { providers } from "../providers/registry";

/** The title line. Everything centres on y 30, where the lights are. The
 *  boring menus are on the platform's bar; only the work is here. */
export function Head() {
  const panes = ui.use((s) => s.navigator || s.inspector);
  const d = doc.use();
  const j = jobs.use();
  const waiting = pending(j).length;
  const running = current(j);
  nav.use((n) => n.focus);
  const nodes = graph.use((g) => g.nodes);
  const path = trail();
  const [menu, setMenu] = useState(false);
  const { drawWith } = ui.use();
  const drawer = providers.find((p) => p.descriptor.id === drawWith)?.descriptor.name ?? "Mock";
  const go = (id: string | null) =>
    riseTo(id, () => requestAnimationFrame(fitAll), { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const status = d.save === "saving" ? "Saving…" : d.save === "failed" ? "Save failed" : d.path ? (d.dirty ? "Edited" : "Saved") : d.dirty ? "Unsaved" : "";
  return (
    <header className="head" data-tauri-drag-region>
      <div className="lights-room" data-tauri-drag-region />

      <div className="spacer" data-tauri-drag-region />

      <div className="doc">
        <button className="pill-icon" aria-label="Previous document">
          <Icon icon={ChevronLeftIcon} size={14} strokeWidth={2} />
        </button>
        <button className={`pill doc-tab${path.length ? " crumb" : ""}`} title={d.path ?? "Not saved yet"} onClick={() => path.length && go(null)}>
          {d.name}
          {status && !path.length && <span className={`doc-status${d.save === "failed" ? " bad" : ""}`}>{status}</span>}
          {!path.length && (
            <span className="x" role="button" aria-label="Close document">
              <Icon icon={CloseIcon} size={11} strokeWidth={2.2} />
            </span>
          )}
        </button>
        {path.map((id, i) => (
          <span key={id} className="crumbs">
            <Icon icon={ChevronRightIcon} size={12} strokeWidth={2} className="crumb-sep" />
            <button className={`pill doc-tab${i < path.length - 1 ? " crumb" : ""}`} onClick={() => i < path.length - 1 && go(id)}>
              {nodes[id]?.title}
            </button>
          </span>
        ))}
        <button className="pill-icon" aria-label="Next document">
          <Icon icon={ChevronRightIcon} size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="spacer" data-tauri-drag-region />

      <div className="tools">
        <button className="pill-icon" aria-label="More">
          <Icon icon={MoreIcon} size={15} strokeWidth={2} />
        </button>
        <span className="queue-group">
          <button className="pill queue" onClick={() => enqueue()} title={`Run the graph with ${drawer} — ⌘↩`}>
            <Icon icon={RunIcon} size={13} strokeWidth={2.2} />
            Queue
            <span className="n">{running ? `${Math.round(running.progress * 100)}%` : waiting || drawer}</span>
          </button>
          <button className={`pill queue-more${menu ? " on" : ""}`} aria-label="Run with…" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Icon icon={ChevronDownIcon} size={12} strokeWidth={2.2} />
          </button>
          {menu && <QueueMenu onClose={() => setMenu(false)} />}
        </span>
        <button className="pill-icon" aria-label="Clear queue" title="Stop and clear the queue" onClick={clearQueue} disabled={!waiting}>
          <Icon icon={CloseIcon} size={14} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Duplicate">
          <Icon icon={CopyIcon} size={14} strokeWidth={2} />
        </button>
        <button
          className="pill-icon"
          aria-label="Panes"
          aria-pressed={panes}
          onClick={togglePanes}
        >
          <Icon icon={MenuIcon} size={15} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
