import { useEffect, useMemo } from "react";
import { Icon, SourceIcon } from "../icons";
import { graph, type GraphNode } from "../state/graph";
import { doc } from "../state/doc";
import { urlFor, assets } from "../state/assets";
import { enter } from "../state/nav";
import { say } from "../state/notice";
import { createStore } from "../state/store";
import { openKept } from "../platform/fs";
import { Editor } from "../writer/Editor";
import { countWords } from "../writer/markup";
import { kindWord } from "./Node";

/** a page to open a document at, asked for by whatever opened it */
const openingAt = createStore<{ id: string; page: number } | null>(null);

/** Open a document clipping at one of its pages. */
export function openSourceAt(id: string, page: number) {
  openingAt.set({ id, page });
  enter(id);
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * A clipping opened (PLAN.md M3.3): its source, read-only, the way the
 * manuscript reads — a document page by page with its folios, a picture as
 * large as the window lets it be, a passage with the document it came from.
 * The file itself is kept in the project, and opens in the Mac's own app
 * (*Show the original*).
 */
export function Source({ id }: { id: string }) {
  const node = graph.use((g) => g.nodes[id]);
  const what = String(node?.data.what ?? "");
  const text = String(node?.data.text ?? "");
  const pages = useMemo(() => text.split("\f").map((p) => p.trim()), [text]);

  // opened at a page: there, once it is drawn
  useEffect(() => {
    const want = openingAt.get();
    const page = want?.id === id ? want.page : Number(node?.data.page) || 0;
    openingAt.set(null);
    if (page > 1) requestAnimationFrame(() => document.getElementById(`source-page-${page}`)?.scrollIntoView({ block: "start" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!node) return null;
  const from = String(node.data.from ?? "");
  const source = String(node.data.source ?? "") || (what === "picture" ? node.asset ?? "" : "");
  const original = () => {
    const dir = doc.get().path;
    if (dir && source) openKept(dir, source).catch((e) => say(String(e)));
  };
  const words = what === "picture" ? 0 : countWords(text.replaceAll("\f", " "));
  const of = String(node.data.of ?? "");
  const whole = of ? graph.get().nodes[of] : undefined;

  return (
    <div className="docpage read source" onPointerDown={(e) => e.stopPropagation()}>
      <article className={`paper k-page${what === "picture" ? " source-wide" : ""}`}>
        <header className="paper-head">
          <p className="paper-meta">
            <span className="dot" />
            <span>{what === "picture" ? "Picture" : what === "passage" ? "Passage" : kindWord(from)}</span>
            {what === "document" && pages.length > 1 && (
              <>
                <span className="sep">·</span>
                <span>{pages.length} pages</span>
              </>
            )}
            {words > 0 && (
              <>
                <span className="sep">·</span>
                <span>{fmt(words)} words</span>
              </>
            )}
          </p>
          <h1 className="read-title">{node.title}</h1>
          <p className="source-from">
            <span className="source-file" title={from}>
              <Icon icon={SourceIcon} size={12} strokeWidth={2} />
              {from || "Where it came from is not known"}
            </span>
            {source && (
              <button className="pill pill-sm" onClick={original} title="Open the file in the Mac's own app for it">
                Show the original
              </button>
            )}
          </p>
        </header>
        {what === "picture" && <Picture node={node} />}
        {what === "passage" && (
          <>
            <Editor value={text} readOnly className="prose prose-read selectable" />
            {whole && (
              <p className="source-whole">
                <button className="pill pill-sm" onClick={() => openSourceAt(whole.id, Number(node.data.page) || 1)}>
                  Open “{whole.title}”{Number(node.data.page) ? ` at page ${node.data.page}` : ""}
                </button>
              </p>
            )}
          </>
        )}
        {what === "document" &&
          (words === 0 ? (
            <p className="read-none">No words in it — a scan that was not read, or pictures only. Show the original to see it.</p>
          ) : (
            pages.map((p, i) => (
              <section key={i} id={`source-page-${i + 1}`} className="read-page source-page">
                {pages.length > 1 && <span className="read-folio px">Page {i + 1}</span>}
                {p ? <Page text={p} /> : <p className="read-none">A page with no words.</p>}
              </section>
            ))
          ))}
      </article>
    </div>
  );
}

/** a page's words, with the pictures kept from the document where they stood */
function Page({ text }: { text: string }) {
  const parts = text.split(/^!\[[^\]]*\]\((assets\/[^)\s]+)\)$/m);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? <Kept key={i} rel={part} /> : part.trim() ? <Editor key={i} value={part.trim()} readOnly className="prose prose-read selectable" /> : null,
      )}
    </>
  );
}

function Kept({ rel }: { rel: string }) {
  assets.use(); // drawn again when the picture arrives
  const url = urlFor(rel);
  return <div className="source-picture">{url && <img src={url} alt="" draggable={false} />}</div>;
}

function Picture({ node }: { node: GraphNode }) {
  assets.use();
  const url = urlFor(node.asset);
  return <div className="source-picture">{url && <img src={url} alt={node.title} draggable={false} />}</div>;
}
