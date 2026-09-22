import { graph } from "../state/graph";
import { sections, countWords } from "../state/reading";
import { doc } from "../state/doc";
import { Prose } from "./Doc";

/** A place read as one: its chapters and their pages in order, one
 *  column, every page written in where it lies. The book as a book. */
export function Read({ id }: { id: string | null }) {
  const g = graph.use();
  const name = doc.use((d) => d.name);
  const node = id ? g.nodes[id] : undefined;
  const secs = sections(g, id);
  const pages = secs.flatMap((s) => s.pages);
  const words = pages.reduce((n, p) => n + countWords(String(p.data.text ?? "")), 0);
  return (
    <div className="docpage read" onPointerDown={(e) => e.stopPropagation()}>
      <article className="paper k-page">
        <header className="paper-head">
          <p className="paper-meta">
            <span className="dot" />
            <span>Reading</span>
            <span className="sep">·</span>
            <span>{pages.length} {pages.length === 1 ? "page" : "pages"}</span>
            {words > 0 && <><span className="sep">·</span><span>{words.toLocaleString("en-US")} words</span></>}
          </p>
          <h1 className="read-title">{node?.title ?? name}</h1>
          {node?.kind === "chapter" && String(node.data.summary ?? "").trim() && <p className="read-line">{String(node.data.summary)}</p>}
        </header>
        {pages.length === 0 && <p className="read-none">Nothing to read yet. Pages written here, and in chapters here, will run on in order.</p>}
        {secs.map((sec, i) => (
          <section key={sec.chapter?.id ?? `loose-${i}`} className="read-chapter">
            {sec.chapter && (
              <header className="read-chapter-head">
                <h2 className="read-chapter-name">{sec.chapter.title}</h2>
                {String(sec.chapter.data.summary ?? "").trim() && <p className="read-line">{String(sec.chapter.data.summary)}</p>}
              </header>
            )}
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
