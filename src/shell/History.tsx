import { useEffect } from "react";
import { jobs, retry, type Job } from "../state/jobs";
import { graph, select, takeOutput } from "../state/graph";
import { thumbFor, assets } from "../state/assets";
import { fitRect } from "../canvas/camera";
import { screenRect } from "../canvas/view";
import { nav, riseTo } from "../state/nav";
import type { ImageRequest } from "../providers/types";

/** Recent runs, newest first — what came out, from what, and how long it took. */
export function History({ onClose }: { onClose: () => void }) {
  const j = jobs.use();
  const g = graph.use();
  assets.use();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const runs = [...j.order].reverse().map((id) => j.jobs[id]).filter((x) => x.state === "completed" || x.state === "failed" || x.state === "cancelled");

  const open = (run: Job) => {
    const node = g.nodes[run.nodeId];
    if (!node) return;
    if (nav.get().focus !== node.parent) riseTo(node.parent);
    select([node.id]);
    fitRect(node, screenRect(), 160);
    if (run.outputs?.[0] && node.kind === "generate") takeOutput(node.id, run.outputs[0]);
    onClose();
  };

  return (
    <div className="hist card" role="menu" aria-label="Runs">
      <div className="list">
        <div className="list-head">Runs</div>
        {runs.length === 0 && <p className="pane-empty">Nothing has run yet. Queue runs the graph.</p>}
        {runs.slice(0, 12).map((run) => {
          const node = g.nodes[run.nodeId];
          const thumb = run.outputs?.[0] ? thumbFor(run.outputs[0], 256) : undefined;
          const secs = run.startedAt && run.endedAt ? ((run.endedAt - run.startedAt) / 1000).toFixed(1) : "–";
          const req = run.request as ImageRequest;
          return (
            <button key={run.id} className={`list-row hist-row${run.state === "failed" ? " failed" : ""}`} role="menuitem" onClick={() => (run.state === "failed" ? (retry(run.id), onClose()) : open(run))} title={run.state === "failed" ? `${run.error ?? "Failed"} — click to retry` : undefined}>
              <span className="hist-thumb well">{thumb && <img src={thumb} alt="" draggable={false} />}</span>
              <span className="hist-what">
                <span className="list-word">{node?.title ?? "A node that is gone"}</span>
                <span className="hist-note px">
                  {run.state === "failed" ? "failed · retry" : run.state === "cancelled" ? "stopped" : run.kind === "image" ? `seed ${req.seed}${(run.count ?? 1) > 1 ? ` · ${run.count} candidates` : ""}` : run.provider ?? "text"}
                  {" · "}
                  {secs}s
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
