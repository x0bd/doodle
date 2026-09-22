import { graph, childrenOf, type GraphNode, type GraphState } from "../state/graph";
import { doc } from "../state/doc";
import { Prose } from "./Doc";

/** the pages under a place, in reading order: a chapter's pages in the
 *  chapter's order, loose pages where they fall */
function collect(g: GraphState, id: string | null): { chapter?: GraphNode; pages: GraphNode[] }[] {
  const kids = childrenOf(g, id).map((c) => g.nodes[c]).filter((n) => n.status !== "rejected").sort((a, b) => a.seq - b.seq);
  const out: { chapter?: GraphNode; pages: GraphNode[] }[] = [];
  let loose: GraphNode[] = [];
  const flush = () => {
    if (loose.length) out.push({ pages: loose });
    loose = [];
  };
  for (const n of kids) {
    if (n.kind === "page") loose.push(n);
    else if (n.kind === "chapter") {
      flush();
      out.push({ chapter: n, pages: childrenOf(g, n.id).map((c) => g.nodes[c]).filter((p) => p.kind === "page" && p.status !== "rejected").sort((a, b) => a.seq - b.seq) });
    }
  }
  flush();
  return out;
}

const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** A place read as one: its chapters and their pages in order, one
 *  column, every page written in where it lies. The book as a book. */
export function Read({ id }: { id: string | null }) {
  const g = graph.use();
  const name = doc.use((d) => d.name);
  const node = id ? g.nodes[id] : undefined;
  const sections = collect(g, id);
  const pages = sections.flatMap((s) => s.pages);
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
        {sections.map((sec, i) => (
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
