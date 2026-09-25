import { Icon, CloseIcon } from "../icons";
import { drafts, reject, cancel } from "../state/drafts";
import { FIELD } from "../state/asking";
import { nav } from "../state/nav";
import { Editor } from "../writer/Editor";

/**
 * What the agent said when asked from the field (PLAN.md M6.5): beside
 * the field, the question and its answer — what it is doing while it
 * works, the words as they come, then the answer to read and put away.
 * What it proposed waits on the pages it proposed it for.
 */
export function Answers() {
  const all = drafts.use();
  // the book's top level is where they were asked; entered anywhere, they wait there
  const top = nav.use((n) => n.focus === null);
  const mine = Object.values(all).filter((d) => d.nodeId === FIELD);
  if (!mine.length || !top) return null;
  return (
    <aside className="built card answers" aria-label="Answers">
      <div className="built-list">
        {mine.map((d) => (
          <section key={d.id} className={`answer ${d.state}`} aria-live="polite">
            <div className="built-head">
              <span className="built-title answer-q">{d.instruction}</span>
              {d.state === "thinking" ? (
                <button className="pill pill-sm" onClick={() => cancel(d.id)} title="Stop — nothing it proposed so far goes">
                  Stop
                </button>
              ) : (
                <button className="pill-icon built-x" onClick={() => reject(d.id)} aria-label="Done" title="Done with it">
                  <Icon icon={CloseIcon} size={12} strokeWidth={2} />
                </button>
              )}
            </div>
            <p className="built-by px answer-by">
              {d.state === "thinking" ? `${d.provider ?? "Thinking"}${d.doing ? ` · ${d.doing}` : ""}…` : d.state === "failed" ? "Could not" : `${d.provider ?? "The agent"} answered`}
            </p>
            {d.state === "failed" ? <p className="built-text">{d.error}</p> : d.text && <Editor value={d.text} readOnly className="prose answer-text selectable" />}
          </section>
        ))}
      </div>
    </aside>
  );
}
