import { Icon, HistoryIcon, SaveIcon, ModelIcon, ImageIcon, GenerateIcon, SettingsIcon } from "../icons";
import { save } from "../state/doc";
import { graph, updateData } from "../state/graph";
import { jobs, enqueue, generators, current, latest, mainPort } from "../state/jobs";
import { openSettings } from "../state/ui";
import { nav } from "../state/nav";
import { WRITER_KINDS } from "../canvas/Writer";
import { propose } from "../state/drafts";
import { useState } from "react";
import { History } from "./History";

/** The prompt bar at the foot of the field: the positive prompt of the
 *  first generator, and the run. */
export function Bar() {
  const g = graph.use();
  const j = jobs.use();
  const focus = nav.use((n) => n.focus);
  const [ask, setAsk] = useState("");
  const [hist, setHist] = useState(false);
  if (focus && WRITER_KINDS.has(g.nodes[focus]?.kind)) {
    const send = () => {
      if (!ask.trim()) return;
      void propose(focus, "ask", ask.trim());
      setAsk("");
    };
    return (
      <div className="bar card ask">
        <div className="bar-ask well">
          <span className="lbl">Ask</span>
          <input
            className="bar-text"
            value={ask}
            placeholder="What should happen to this passage?"
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), send())}
            spellCheck={false}
          />
        </div>
        <div className="bar-acts">
          <button className="pill pill-sm" onClick={() => void propose(focus, "expand")}>Expand</button>
          <button className="pill pill-sm" onClick={() => void propose(focus, "continue")}>Continue</button>
          <button className="pill pill-sm" onClick={() => void propose(focus, "rewrite")}>Rewrite</button>
          <div className="gap" />
          <span className="bar-note px">Drafts wait below the text until you keep them</span>
        </div>
      </div>
    );
  }
  const gen = generators()[0];
  const edge = gen && Object.values(g.edges).find((e) => e.to.node === gen.id && e.to.port === mainPort(gen));
  const promptNode = edge ? g.nodes[edge.from.node] : undefined;
  const running = current(j);
  const last = latest(j);
  const note = running
    ? (running.kind === "text" ? `Writing · ${running.note ?? ""}` : `Rendering ${running.note ?? ""}`)
    : last?.state === "completed" && last.startedAt && last.endedAt
      ? `Done in ${((last.endedAt - last.startedAt) / 1000).toFixed(1)}s`
      : last?.state === "failed"
        ? "Failed"
        : "";

  return (
    <div className="bar card">
      {hist && <History onClose={() => setHist(false)} />}
      <div className="bar-ask well">
        <span className="lbl">Prompt</span>
        {promptNode ? (
          <textarea
            className="bar-text"
            rows={2}
            value={String(promptNode.data.text ?? "")}
            placeholder="What you want to get"
            spellCheck={false}
            onChange={(e) => updateData(promptNode.id, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                enqueue();
              }
            }}
          />
        ) : (
          <p className="bar-none">Wire a prompt into a generator or a writer.</p>
        )}
      </div>
      <div className="bar-acts">
        <button className={`pill-icon${hist ? " on" : ""}`} aria-label="History" title="Runs" aria-pressed={hist} onClick={() => setHist((h) => !h)}>
          <Icon icon={HistoryIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Save" title="Save — ⌘S" onClick={() => void save()}>
          <Icon icon={SaveIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Model" title="Model">
          <Icon icon={ModelIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Image" title="Image">
          <Icon icon={ImageIcon} size={15} strokeWidth={2} />
        </button>
        <div className="gap" />
        <button className="pill-icon" aria-label="Generate" title="Generate — ⌘↩" onClick={() => enqueue()}>
          <Icon icon={GenerateIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Settings" onClick={openSettings}>
          <Icon icon={SettingsIcon} size={15} strokeWidth={2} />
        </button>
        {note && <span className="bar-note px">{note}</span>}
      </div>
    </div>
  );
}
