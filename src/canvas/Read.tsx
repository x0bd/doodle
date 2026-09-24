import { graph } from "../state/graph";
import { sections, sectionWords, countWords } from "../state/reading";
import { doc } from "../state/doc";
import { Prose } from "./Doc";

/** A place read as one: its chapters in order, each its own words (D1),
 *  and loose pages where they fall — one column, written in where it lies.
 *  The book as a book. */
export function Read({ id }: { id: string | null }) {
  const g = graph.use();
  const name = doc.use((d) => d.name);
  const node = id ? g.nodes[id] : undefined;
  const secs = sections(g, id);
  const words = secs.reduce((n, s) => n + sectionWords(s).reduce((m, t) => m + countWords(t), 0), 0);
  const chapters = secs.filter((s) => s.chapter).length;
  return (
    <div className="docpage read" onPointerDown={(e) => e.stopPropagation()}>
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
          <section key={sec.chapter?.id ?? `loose-${i}`} className="read-chapter">
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
