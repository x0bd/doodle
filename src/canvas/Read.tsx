import { useEffect, useRef, useState } from "react";
import { graph } from "../state/graph";
import { Icon, PopUpIcon } from "../icons";
import { sections, sectionWords, countWords } from "../state/reading";
import { doc } from "../state/doc";
import { Prose } from "./Doc";

/** A place read as one — the manuscript (PLAN.md M2.2): its chapters in
 *  order, each its own words (D1), written in where they lie, and loose
 *  pages where they fall. A capsule at the top of the column says which
 *  chapter is in view and goes to any other. The book as a book.
 *
 *  Measured on the 134k-word benchmark book (release): opens in ~350 ms,
 *  scrolls at 60 fps, a keystroke lands inside one frame — every chapter
 *  stays a live writer; nothing is virtualised until a book needs it. */
export function Read({ id }: { id: string | null }) {
  const g = graph.use();
  const name = doc.use((d) => d.name);
  const node = id ? g.nodes[id] : undefined;
  const secs = sections(g, id);
  const words = secs.reduce((n, s) => n + sectionWords(s).reduce((m, t) => m + countWords(t), 0), 0);
  const chapters = secs.filter((s) => s.chapter).length;
  const list = secs.flatMap((s) => (s.chapter ? [s.chapter] : []));
  const here = useHere(list.map((c) => c.id));
  const [jumping, setJumping] = useState(false);
  const go = (cid: string) => {
    setJumping(false);
    document.getElementById(`read-${cid}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return (
    <div className="docpage read" onPointerDown={(e) => e.stopPropagation()}>
      {list.length > 1 && (
        <div className="read-jump">
          <button className="pill pill-sm read-jump-key" onClick={() => setJumping((j) => !j)} aria-haspopup="menu" aria-expanded={jumping}>
            <span className="read-jump-name">{(here && g.nodes[here]?.title) || list[0].title}</span>
            <Icon icon={PopUpIcon} size={12} strokeWidth={2} />
          </button>
          {jumping && (
            <div className="cmenu card read-jump-menu" role="menu">
              <div className="list">
                {list.map((c, i) => (
                  <button key={c.id} role="menuitem" className={`list-row${c.id === here ? " on" : ""}`} onClick={() => go(c.id)}>
                    <span className="read-jump-n px">{i + 1}</span>
                    <span className="list-word">{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <article className="paper k-page">
        <header className="paper-head">
          <p className="paper-meta">
            <span className="dot" />
            <span>Reading</span>
            <span className="sep">·</span>
            <span>{chapters} {chapters === 1 ? "chapter" : "chapters"}</span>
            {words > 0 && <><span className="sep">·</span><span>{words.toLocaleString("en-US")} words</span></>}
          </p>
          <h1 className="read-title">{node?.title ?? name}</h1>
          {node?.kind === "chapter" && String(node.data.summary ?? "").trim() && <p className="read-line">{String(node.data.summary)}</p>}
        </header>
        {words === 0 && <p className="read-none">Nothing to read yet. Chapters written here will run on in order.</p>}
        {secs.map((sec, i) => (
          <section key={sec.chapter?.id ?? `loose-${i}`} id={sec.chapter ? `read-${sec.chapter.id}` : undefined} data-chapter={sec.chapter?.id} className="read-chapter">
            {sec.chapter && (
              <header className="read-chapter-head">
                <h2 className="read-chapter-name">{sec.chapter.title}</h2>
                {String(sec.chapter.data.summary ?? "").trim() && <p className="read-line">{String(sec.chapter.data.summary)}</p>}
              </header>
            )}
            {sec.chapter && <div className="read-page"><Prose node={sec.chapter} focus={false} /></div>}
            {sec.pages.map((p) => (
              <div key={p.id} className="read-page">
                <span className="read-folio px">{p.title}</span>
                <Prose node={p} focus={false} />
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}

/** Which chapter is in view: the last one whose top has passed a third of
 *  the way down the window, as the manuscript scrolls. */
function useHere(ids: string[]) {
  const [here, setHere] = useState<string | null>(null);
  const key = ids.join(",");
  const raf = useRef(0);
  useEffect(() => {
    const stage = document.querySelector<HTMLElement>(".stage.reading");
    if (!stage) return;
    const look = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const line = stage.getBoundingClientRect().top + stage.clientHeight / 3;
        let at: string | null = null;
        for (const id of key ? key.split(",") : []) {
          const el = document.getElementById(`read-${id}`);
          if (el && el.getBoundingClientRect().top <= line) at = id;
        }
        setHere(at);
      });
    };
    look();
    stage.addEventListener("scroll", look, { passive: true });
    return () => {
      stage.removeEventListener("scroll", look);
      cancelAnimationFrame(raf.current);
    };
  }, [key]);
  return here;
}
