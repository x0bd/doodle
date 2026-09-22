import { Icon, HistoryIcon, SaveIcon, RunIcon, CloseIcon, UpIcon } from "../icons";
import { save } from "../state/doc";
import { graph, updateData } from "../state/graph";
import { jobs, enqueue, generators, current, latest, mainPort, clearQueue } from "../state/jobs";
import { ui, hideBar } from "../state/ui";
import { nav } from "../state/nav";
import { propose } from "../state/drafts";
import { proposeShots } from "../state/shots";
import { KINDS } from "../graph/kinds";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { History } from "./History";

/** A textarea that grows with its words, to a cap set in the CSS. */
function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0";
  el.style.height = `${el.scrollHeight}px`;
}

/** The prompt bar at the foot of the field: one plate — whose words and
 *  where they go, the words, the keys. Enter starts the run and puts the
 *  bar away; / brings it back with the text ready to edit. On a page it
 *  is the ask. */
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
      <div className={`bar card ask k-${entered.kind}`}>
        <div className="bar-from">
          <span className="dot" />
          <b>Ask</b>
          <span className="to">·</span>
          <span>{entered.title}</span>
        </div>
        <input
          className="bar-text"
          value={ask}
          placeholder={prose ? "What should happen to this passage?" : described ? `What should the agent add to ${entered.title}?` : "Ask about this"}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), send())}
          spellCheck={false}
        />
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
          <span className="bar-note">{prose || described ? "Drafts wait on the page until you keep them" : "Answers arrive as drafts on the page"}</span>
          <button className="bar-go" aria-label="Ask" title="Ask — ⏎" disabled={!ask.trim()} onClick={send}>
            <Icon icon={UpIcon} size={16} strokeWidth={2.25} />
          </button>
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
  const words = String(promptNode?.data.text ?? "");

  return (
    <div className={`bar card${promptNode ? ` k-${promptNode.kind}` : ""}`}>
      {hist && <History onClose={() => setHist(false)} />}
      {promptNode && gen ? (
        <>
          <div className="bar-from" title={`${KINDS[promptNode.kind].title} into ${KINDS[gen.kind].title}`}>
            <span className="dot" />
            <b>{promptNode.title}</b>
            <span className="to">→</span>
            <span>{gen.title}</span>
          </div>
          <Words node={promptNode.id} value={words} innerRef={text} />
        </>
      ) : (
        <p className="bar-none">Wire a scene or a brief into a generator or a writer, and its words come here.</p>
      )}
      <div className="bar-acts">
        <button className={`pill-icon${hist ? " on" : ""}`} aria-label="History" title="Runs" aria-pressed={hist} onClick={() => setHist((h) => !h)}>
          <Icon icon={HistoryIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Save" title="Save — ⌘S" onClick={() => void save()}>
          <Icon icon={SaveIcon} size={15} strokeWidth={2} />
        </button>
        <div className="gap" />
        {note && <span className="bar-note">{note}</span>}
        {running ? (
          <button className="bar-go stop" aria-label="Stop" title="Stop — ⌘." onClick={clearQueue}>
            <Icon icon={CloseIcon} size={14} strokeWidth={2.25} />
          </button>
        ) : (
          <button className="bar-go" aria-label="Run" title="Run — ⏎" disabled={!promptNode || !words.trim()} onClick={() => (enqueue(), hideBar())}>
            <Icon icon={RunIcon} size={15} strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  );
}

function Words({ node, value, innerRef }: { node: string; value: string; innerRef: React.RefObject<HTMLTextAreaElement | null> }) {
  useLayoutEffect(() => grow(innerRef.current), [value, innerRef]);
  return (
    <textarea
      ref={innerRef}
      className="bar-text"
      rows={1}
      value={value}
      placeholder="What you want to get — Enter runs it"
      spellCheck={false}
      onChange={(e) => updateData(node, { text: e.target.value })}
      onKeyDown={(e) => {
        // Enter runs and the bar steps out of the way; shift-Enter breaks a line
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (!value.trim()) return;
          enqueue();
          e.currentTarget.blur();
          hideBar();
        } else if (e.key === "Escape") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
