import { Icon, PlusIcon, MinusIcon, FitIcon, EyeIcon, LinkIcon } from "../icons";
import Avatar from "boring-avatars";
import { openSettings, ui, toggleLens } from "../state/ui";
import { graph, childrenOf } from "../state/graph";
import { nav, reading } from "../state/nav";
import { jobs, current, latest } from "../state/jobs";
import { useEffect, useState } from "react";
import { camera, fitAll, zoomIn, zoomOut } from "../canvas/view";

/** Who is working: a placeholder mark until a picture is set. Bauhaus in
 *  the shop's own colours — charcoal, paper, the signal, a slate. */
const WHO = "Tinodaishe";
const MARK = ["#1c1c1b", "#f2f2f0", "#f4a41a", "#6b7a8a", "#c9c4b4"];

/** The foot of the field: you and the readouts on the left, the view
 *  cluster on the right. */
export function Foot() {
  const zoom = camera.use((c) => c.zoom);
  const focus = nav.use((x) => x.focus);
  const n = graph.use((g) => childrenOf(g, focus).length);
  const read = ui.use((u) => u.read);
  const writing = reading(focus, read);
  const lens = ui.use((u) => u.lens);
  const j = jobs.use();
  const running = current(j);
  const last = latest(j);
  // the clock ticks while a job runs, then holds at how long it took
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);
  const elapsed = running
    ? Math.max(0, now - (running.startedAt ?? now)) / 1000
    : last?.startedAt && last.endedAt
      ? (last.endedAt - last.startedAt) / 1000
      : 0;
  return (
    <>
      <div className="foot-l">
        <button className="pill-icon who" aria-label="Settings" title="You — settings, ⌘," onClick={openSettings}>
          <Avatar name={WHO} variant="bauhaus" size={26} colors={MARK} />
        </button>
        <div className="readout" aria-hidden>
          <span><span className="k">T</span>{elapsed.toFixed(2)}s</span>
          <span><span className="k">I</span>{j.iterations}</span>
          <span><span className="k">N</span>{n}</span>
        </div>
      </div>

      {!writing && <div className="cluster card">
        <button className="pill-icon" aria-label="Fit to view" title="Fit — ⌘0" onClick={fitAll}>
          <Icon icon={FitIcon} size={14} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Reveal">
          <Icon icon={EyeIcon} size={15} strokeWidth={2} />
        </button>
        <button className={`pill-icon${lens ? " on" : ""}`} aria-label="Lens" aria-pressed={lens} title="Lens — only what the selection touches stays lit (hold L)" onClick={toggleLens}>
          <Icon icon={LinkIcon} size={15} strokeWidth={2} />
        </button>
        <span className="gap" />
        <button className="pill-icon" aria-label="Zoom out" title="Zoom out — ⌘−" onClick={zoomOut}>
          <Icon icon={MinusIcon} size={15} strokeWidth={2} />
        </button>
        <span className="fig">{Math.round(zoom * 100)}%</span>
        <button className="pill-icon" aria-label="Zoom in" title="Zoom in — ⌘+" onClick={zoomIn}>
          <Icon icon={PlusIcon} size={15} strokeWidth={2} />
        </button>
      </div>}
    </>
  );
}
