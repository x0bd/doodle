import { Icon, HistoryIcon, SaveIcon, RunIcon, CloseIcon, UpIcon, GenerateIcon, TextIcon } from "../icons";
import { save } from "../state/doc";
import { graph, updateData, childrenOf } from "../state/graph";
import { jobs, enqueue, generators, current, latest, mainPort, clearQueue } from "../state/jobs";
import { ui, hideBar, showBar, hideAsk, toggleAsk } from "../state/ui";
import { nav } from "../state/nav";
import { propose } from "../state/drafts";
import { proposeShots } from "../state/shots";
import { checkContinuity } from "../state/continuity";
import { KINDS, PLACES } from "../graph/kinds";
import { gatherDialog } from "../state/gather";
import { buildFromBoard, styleFromPictures } from "../state/build";
import { tagsIn } from "../state/tags";
import { filtering, filterBy } from "../state/tagging";
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
  const filter = filtering.use();
  const shown = ui.use((u) => u.bar);
  const asking = ui.use((u) => u.ask);
  const [ask, setAsk] = useState("");
  const [hist, setHist] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  // brought back by a key: the text is ready to edit, the caret at its end.
  // Only when it comes back — never on arrival, or the field's keys would
  // all land in the prompt.
  const wasShown = useRef(shown);
  useEffect(() => {
    const came = shown && !wasShown.current;
    wasShown.current = shown;
    if (!came || !text.current) return;
    const el = text.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [shown]);
  const askRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (asking) askRef.current?.focus();
  }, [asking]);
  const entered = focus ? g.nodes[focus] : undefined;
  // a document gets the ask; a place (a chapter) is a field and gets the prompt bar for what runs there
  if (entered && !PLACES.has(entered.kind)) {
    const prose = entered.kind === "prompt" || entered.kind === "note" || entered.kind === "page" || entered.kind === "chapter";
    const described = entered.kind === "character" || entered.kind === "location" || entered.kind === "style";
    const send = () => {
      if (!ask.trim()) return;
      void propose(entered.id, "ask", ask.trim());
      setAsk("");
    };
    // closed, the ask is one quiet key at the foot: the page is the page
    if (!asking) {
      return (
        <button className="bar-key card" aria-label="Ask the agent" title="Ask — /" onClick={toggleAsk}>
          <Icon icon={GenerateIcon} size={16} strokeWidth={1.9} />
        </button>
      );
    }
    return (
      <div className={`bar card ask k-${entered.kind}`}>
        <div className="bar-from">
          <span className="dot" />
          <b>Ask</b>
          <span className="to">·</span>
          <span>{entered.title}</span>
        </div>
        <input
          ref={askRef}
          className="bar-text"
          value={ask}
          placeholder={prose ? "What should happen to this passage?" : described ? `What should the agent add to ${entered.title}?` : "Ask about this"}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), send());
            else if (e.key === "Escape") (e.preventDefault(), hideAsk());
          }}
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
          {(entered.kind === "chapter" || entered.kind === "page") && (
            <button className="pill pill-sm" onClick={() => void checkContinuity(entered.id)} title="Read it against the bible, the characters and places, and the chapters before; what does not agree is proposed as comments">
              Check
            </button>
          )}
          <div className="gap" />
          <span className="bar-note">{prose || described ? "Drafts wait on the page until you keep them" : "Answers arrive as drafts on the page"}</span>
          <button className="pill-icon" aria-label="Close" title="Close — esc" onClick={hideAsk}>
            <Icon icon={CloseIcon} size={13} strokeWidth={2.2} />
          </button>
          <button className="bar-go" aria-label="Ask" title="Ask — ⏎" disabled={!ask.trim()} onClick={send}>
            <Icon icon={UpIcon} size={16} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    );
  }
  // on a board, the bar is what a board does: gather, and build from it
  if (entered?.kind === "board") {
    const n = childrenOf(g, entered.id).filter((id) => g.nodes[id].kind === "clip").length;
    const picked = g.selection.filter((id) => g.nodes[id]?.kind === "clip" && g.nodes[id].data.what === "picture").length;
    const tags = tagsIn(childrenOf(g, entered.id).map((id) => g.nodes[id]));
    return (
      <div className="bar card k-board board-bar">
        <div className="bar-from">
          <span className="dot" />
          <b>{entered.title}</b>
          <span className="to">·</span>
          <span>{n ? `${n} ${n === 1 ? "clipping" : "clippings"}` : "empty"}</span>
          {/* the board's tags: one chosen, only what carries it stays lit (M3.8) */}
          {tags.length > 0 && (
            <span className="bar-tags" role="radiogroup" aria-label="Filter by tag">
              {tags.slice(0, 8).map(({ tag, n: c }) => {
                const on = filter?.tag === tag;
                return (
                  <button key={tag} className={`bar-tag${on ? " on" : ""}`} role="radio" aria-checked={on} onClick={() => filterBy(on ? null : tag)} title={on ? "Show everything" : `Only what is tagged #${tag} (${c})`}>
                    #{tag}
                  </button>
                );
              })}
            </span>
          )}
        </div>
        <div className="bar-acts">
          {!picked && <span className="bar-note">{n ? "The writer reads it all and proposes a cast, places, a style and an outline" : "Drop documents and pictures here"}</span>}
          <div className="gap" />
          <button className="pill pill-sm" onClick={() => void gatherDialog(entered.id)} title="Documents or pictures — ⇧⌘I">
            Add…
          </button>
          {picked > 0 && (
            <button className="pill pill-sm" onClick={() => void styleFromPictures(g.selection)} title="The look the chosen pictures share, as a style — they ride with it as references">
              Make a style from {picked === 1 ? "this" : `these ${picked}`}
            </button>
          )}
          <button className="pill" onClick={() => void buildFromBoard(entered.id)} disabled={!n} title="Read the board and propose what the book could be built from">
            Build from the board
          </button>
        </div>
      </div>
    );
  }
  // away, the bar is one quiet key: the field is the field
  if (!shown) {
    return (
      <button className="bar-key card" aria-label="The prompt" title="The prompt — /" onClick={showBar}>
        <Icon icon={TextIcon} size={16} strokeWidth={1.9} />
      </button>
    );
  }
  // the first runnable at this level, else anywhere
  const gen = generators().find((n) => n.parent === (focus ?? null)) ?? generators()[0];
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
        <button className="pill-icon" aria-label="Put away" title="Put away — the key brings it back" onClick={hideBar}>
          <Icon icon={CloseIcon} size={13} strokeWidth={2.2} />
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
