import { useEffect, useMemo, useState } from "react";
import { diffWordsWithSpace, type Change } from "diff";
import { Icon, CloseIcon } from "../icons";
import { graph } from "../state/graph";
import { doc, save } from "../state/doc";
import { browsing, closeVersions, keepVersion, readVersion, restoreVersion, subtree, versions, wordCount, wordsOf, type Reason, type Sub, type VersionMeta } from "../state/versions";
import { say } from "../state/notice";

const REASON: Record<Reason, string> = { daily: "Daily", kept: "Kept", "before-restore": "Before a restore" };

/** Today 09:14 · Yesterday 18:02 · Mon 21 Sep, 10:30 */
function when(t: number) {
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

const words = (n: number) => (n === 1 ? "one word" : `${n} words`);
/** what a restore would do, in a sentence */
function change(back: number, since: number) {
  if (!back && !since) return "The same as now.";
  if (!since) return `Restoring brings back ${words(back)}.`;
  if (!back) return `Restoring takes out the ${words(since)} written since.`;
  return `Restoring brings back ${words(back)} and takes out ${words(since)} written since.`;
}

/**
 * A node's versions (File › Versions…): the list down the left, newest
 * first, and the chosen one read against now — what restoring would bring
 * back marked, what has been written since struck through.
 */
export function Versions() {
  const id = browsing.use();
  const { dir, list } = versions.use();
  const g = graph.use();
  const path = doc.use((d) => d.path);
  const node = id ? g.nodes[id] : undefined;
  const mine = useMemo(() => list.filter((v) => v.node === id).sort((a, b) => b.at - a.at), [list, id]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [body, setBody] = useState<Sub | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = mine.find((v) => v.id === chosen) ?? mine[0];

  useEffect(() => {
    if (id === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeVersions();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  useEffect(() => {
    setBody(null);
    if (!pick) return;
    let live = true;
    readVersion(pick).then((b) => live && setBody(b), () => live && setBody(null));
    return () => {
      live = false;
    };
  }, [pick?.id]);

  const parts: Change[] = useMemo(() => {
    if (!body || !pick || !id) return [];
    const then = wordsOf(body, pick.node);
    const now = node ? wordsOf(subtree(g, id), id) : "";
    return diffWordsWithSpace(then, now);
  }, [body, pick?.id, g, id, node]);

  if (id === null) return null;
  const back = parts.filter((p) => p.removed).reduce((n, p) => n + (p.value.match(/\S+/g)?.length ?? 0), 0);
  const since = parts.filter((p) => p.added).reduce((n, p) => n + (p.value.match(/\S+/g)?.length ?? 0), 0);

  const keepNow = async () => {
    if (!id) return;
    setBusy(true);
    const m = await keepVersion(id).catch(() => null);
    setBusy(false);
    if (m) setChosen(m.id);
  };
  const restore = async (v: VersionMeta) => {
    setBusy(true);
    try {
      await restoreVersion(v);
      closeVersions();
      say(`“${v.title}” is as it was ${when(v.at).toLowerCase()}. What was there is kept as a version.`);
    } catch (e) {
      say(String(e).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="veil">
      <button className="veil-hit" onClick={closeVersions} aria-label="Close versions" tabIndex={-1} />
      <div className="sheet con vsheet" role="dialog" aria-modal="true" aria-label="Versions">
        <nav className="srail vrail" aria-label="Versions">
          <p className="srail-name">Versions</p>
          {node && dir && (
            <div className="list vlist">
              {mine.map((v) => (
                <button key={v.id} className={`list-row vrow${pick?.id === v.id ? " hl" : ""}`} onClick={() => setChosen(v.id)}>
                  <span className="vrow-when">{when(v.at)}</span>
                  <span className="vrow-why">
                    {REASON[v.reason]} <span className="px">· {v.words}</span>
                  </span>
                </button>
              ))}
              {!mine.length && <p className="group-note vnone">None yet. One is kept each day this changes, or keep one now.</p>}
            </div>
          )}
          {node && dir && (
            <button className="pill pill-sm vkeep" onClick={keepNow} disabled={busy}>
              Keep a version now
            </button>
          )}
        </nav>

        <div className="spane">
          <header className="con-head">
            <h2 className="con-name">{node ? node.title : "Versions"}</h2>
            <span className="con-fig px">{node ? `${wordCount(g, id!)} words now` : ""}</span>
            <button className="con-btn" onClick={closeVersions} aria-label="Close versions" title="Close — Esc">
              <Icon icon={CloseIcon} size={13} strokeWidth={2} />
            </button>
          </header>
          <div className="sbody vbody">
            {!node ? (
              <p className="group-note">Choose a page, a chapter, a note or a character, or write in one, and its versions are here.</p>
            ) : !path || !dir ? (
              <div className="vempty">
                <p className="group-note">Versions are kept inside a project. Save this one and they begin.</p>
                <button className="pill pill-sm" onClick={() => void save()}>
                  Save…
                </button>
              </div>
            ) : !pick ? (
              <p className="group-note">Nothing kept yet.</p>
            ) : (
              <>
                <div className="vhead">
                  <p className="group-note">
                    {when(pick.at)} · {REASON[pick.reason].toLowerCase()}.{" "}
                    {body ? change(back, since) : "Reading…"}
                  </p>
                  <button className="pill pill-sm" onClick={() => void restore(pick)} disabled={busy || !body || (!back && !since)}>
                    Restore
                  </button>
                </div>
                <div className="vdiff">
                  {parts.map((p, i) => {
                    if (!p.added && !p.removed) return <span key={i}>{p.value}</span>;
                    // the spaces around a change stay plain: only words are marked
                    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(p.value)!;
                    return (
                      <span key={i}>
                        {lead}
                        {p.removed ? <mark className="v-back">{core}</mark> : <del className="v-since">{core}</del>}
                        {trail}
                      </span>
                    );
                  })}
                </div>
                <p className="group-note vkey">
                  <mark className="v-back">Marked</mark> would come back · <del className="v-since">struck</del> was written since
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
