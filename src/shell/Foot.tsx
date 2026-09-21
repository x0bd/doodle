import { Icon, SettingsIcon, PlusIcon, MinusIcon, FitIcon, EyeIcon, LinkIcon } from "../icons";
import { openSettings } from "../state/ui";
import { graph } from "../state/graph";
import { jobs, current, latest } from "../state/jobs";
import { useEffect, useState } from "react";
import { camera, fitAll, zoomIn, zoomOut } from "../canvas/view";

/** The foot of the field: settings and the readouts on the left, the view
 *  cluster on the right. */
export function Foot() {
  const zoom = camera.use((c) => c.zoom);
  const n = graph.use((g) => g.order.length);
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
        <button className="pill-icon" aria-label="Settings" title="Settings — ⌘," onClick={openSettings}>
          <Icon icon={SettingsIcon} size={15} strokeWidth={2} />
        </button>
        <div className="readout" aria-hidden>
          <span><span className="k">T</span>{elapsed.toFixed(2)}s</span>
          <span><span className="k">I</span>{j.iterations}</span>
          <span><span className="k">N</span>{n}</span>
        </div>
      </div>

      <div className="cluster card">
        <button className="pill-icon" aria-label="Fit to view" title="Fit — ⌘0" onClick={fitAll}>
          <Icon icon={FitIcon} size={14} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Reveal">
          <Icon icon={EyeIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Lens">
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
      </div>
    </>
  );
}
