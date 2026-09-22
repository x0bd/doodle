import { Icon, HistoryIcon, SaveIcon, ModelIcon, ImageIcon, GenerateIcon } from "../icons";
import { save } from "../state/doc";
import { graph, updateData } from "../state/graph";
import { jobs, enqueue, generators, current, latest, mainPort } from "../state/jobs";
import { ui, hideBar } from "../state/ui";
import { nav } from "../state/nav";
import { propose } from "../state/drafts";
import { proposeShots } from "../state/shots";
import { useEffect, useRef, useState } from "react";
import { History } from "./History";

/** The prompt bar at the foot of the field: the positive prompt of the
 *  first generator, and the run. Enter starts the run and puts the bar
 *  away; / brings it back with the text ready to edit. */
export function Bar() {
  const g = graph.use();
  const j = jobs.use();
  const focus = nav.use((n) => n.focus);
  const shown = ui.use((u) => u.bar);
  const [ask, setAsk] = useState("");
  const [hist, setHist] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  // brought back by a key: the text is ready to edit, the caret at its end
  useEffect(() => {
    if (!shown || !text.current) return;
    const el = text.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [shown]);
  const entered = focus ? g.nodes[focus] : undefined;
  if (entered) {
    const prose = entered.kind === "prompt" || entered.kind === "note" || entered.kind === "page";
    const described = entered.kind === "character" || entered.kind === "style";
    const send = () => {
      if (!ask.trim()) return;
      void propose(entered.id, "ask", ask.trim());
      setAsk("");
    };
    return (
      <div className="bar card ask">
        <div className="bar-ask well">
          <span className="lbl">Ask</span>
          <input
            className="bar-text"
            value={ask}
            placeholder={prose ? "What should happen to this passage?" : described ? `What should the agent add to ${entered.title}?` : "Ask about this"}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), send())}
            spellCheck={false}
          />
        </div>
        <div className="bar-acts">
          {entered.kind === "prompt" && (
            <button className="pill pill-sm" onClick={() => void proposeShots(entered.id, 6, ask.trim())} title="Propose six shots for this scene">Shots</button>
          )}
          {(prose || described) && (
            <>
              <button className="pill pill-sm" onClick={() => void propose(entered.id, "expand")}>Expand</button>
              {prose && <button className="pill pill-sm" onClick={() => void propose(entered.id, "continue")}>Continue</button>}
              <button className="pill pill-sm" onClick={() => void propose(entered.id, "rewrite")}>Rewrite</button>
            </>
          )}
          <div className="gap" />
          <span className="bar-note px">{prose || described ? "Drafts wait on the page until you keep them" : "Answers arrive as drafts on the page"}</span>
        </div>
      </div>
    );
  }
  if (!shown) return null;
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
            ref={text}
            className="bar-text"
            rows={2}
            value={String(promptNode.data.text ?? "")}
            placeholder="What you want to get — Enter runs it"
            spellCheck={false}
            onChange={(e) => updateData(promptNode.id, { text: e.target.value })}
            onKeyDown={(e) => {
              // Enter runs and the bar steps out of the way; shift-Enter breaks a line
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!String(promptNode.data.text ?? "").trim()) return;
                enqueue();
                e.currentTarget.blur();
                hideBar();
              } else if (e.key === "Escape") {
                e.currentTarget.blur();
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
        <button className="pill-icon" aria-label="Generate" title="Generate — ⏎" onClick={() => enqueue()}>
          <Icon icon={GenerateIcon} size={15} strokeWidth={2} />
        </button>
        {note && <span className="bar-note px">{note}</span>}
      </div>
    </div>
  );
}
