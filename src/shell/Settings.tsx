import { useEffect, useState } from "react";
import { Icon, CloseIcon, CheckIcon, GeneralIcon, AppearanceIcon, AboutIcon, ProvidersIcon } from "../icons";
import { ui, closeSettings, setTheme, setMotion, setDim, setSpell, openShortcuts, type Theme } from "../state/ui";
import { providers } from "../providers/registry";
import { probe, type Found } from "../providers/found";
import { setUpLocal } from "../providers/local";
import { inTauri } from "../platform/fs";

type Section = "general" | "appearance" | "providers" | "about";
const SECTIONS: { id: Section; label: string; icon: Parameters<typeof Icon>[0]["icon"] }[] = [
  { id: "general", label: "General", icon: GeneralIcon },
  { id: "appearance", label: "Appearance", icon: AppearanceIcon },
  { id: "providers", label: "Providers", icon: ProvidersIcon },
  { id: "about", label: "About", icon: AboutIcon },
];

/** The settings sheet: a console with a rail of sections down its left. */
export function Settings() {
  const open = ui.use((s) => s.settings);
  const [section, setSection] = useState<Section>("appearance");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="veil">
      <button className="veil-hit" onClick={closeSettings} aria-label="Close settings" tabIndex={-1} />
      <div className="sheet con" role="dialog" aria-modal="true" aria-label="Settings">
        <nav className="srail" aria-label="Settings sections">
          <p className="srail-name">Settings</p>
          <div className="list">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                className={`list-row srail-row${section === sec.id ? " hl" : ""}`}
                aria-current={section === sec.id ? "page" : undefined}
                onClick={() => setSection(sec.id)}
              >
                <span className="srail-glyph">
                  <Icon icon={sec.icon} size={14} strokeWidth={1.7} />
                </span>
                <span className="list-word">{sec.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="spane">
          <header className="con-head">
            <h2 className="con-name">{SECTIONS.find((x) => x.id === section)?.label}</h2>
            <span className="con-fig" />
            <button className="con-btn" onClick={closeSettings} aria-label="Close settings" title="Close — Esc">
              <Icon icon={CloseIcon} size={13} strokeWidth={2} />
            </button>
          </header>
          <div className="sbody">
            {section === "general" && <General />}
            {section === "appearance" && <Appearance />}
            {section === "providers" && <Providers />}
            {section === "about" && <About />}
          </div>
        </div>
      </div>
    </div>
  );
}

function General() {
  const motion = ui.use((s) => s.motion);
  const dim = ui.use((s) => s.dim);
  const spell = ui.use((s) => s.spell);
  return (
    <>
    <section className="grp">
      <p className="group-head">Keyboard</p>
      <div className="group">
        <div className="group-row">
          <div className="group-what">
            <p className="group-name">Shortcuts</p>
            <p className="group-note">Every key Doodle answers to, on one sheet.</p>
          </div>
          <button className="pill" onClick={() => (closeSettings(), openShortcuts())}>Show</button>
        </div>
      </div>
    </section>
    <section className="grp">
      <p className="group-head">Writing</p>
      <div className="group">
        <div className="group-row">
          <div className="group-what">
            <p className="group-name">Focus</p>
            <p className="group-note">⇧⌘F while writing: only the words, the line you are on held where your eye is. The paragraphs around yours can step back.</p>
          </div>
          <div className="seg" role="radiogroup" aria-label="In Focus">
            <button className={`seg-btn${dim ? " on" : ""}`} role="radio" aria-checked={dim} onClick={() => setDim(true)}>Dim the rest</button>
            <button className={`seg-btn${!dim ? " on" : ""}`} role="radio" aria-checked={!dim} onClick={() => setDim(false)}>All lit</button>
          </div>
        </div>
        <div className="group-row">
          <div className="group-what">
            <p className="group-name">Spelling</p>
            <p className="group-note">The Mac's own checker. The names of the book's people and places are never marked; right-click a word to teach it to the book.</p>
          </div>
          <div className="seg" role="radiogroup" aria-label="Spelling">
            <button className={`seg-btn${spell ? " on" : ""}`} role="radio" aria-checked={spell} onClick={() => setSpell(true)}>Check</button>
            <button className={`seg-btn${!spell ? " on" : ""}`} role="radio" aria-checked={!spell} onClick={() => setSpell(false)}>Off</button>
          </div>
        </div>
      </div>
    </section>
    <section className="grp">
      <p className="group-head">Motion</p>
      <div className="group">
        <div className="group-row">
          <div className="group-what">
            <p className="group-name">Camera and panes</p>
            <p className="group-note">Reduced keeps every move instant. Keyboard actions never animate either way.</p>
          </div>
          <div className="seg" role="radiogroup" aria-label="Motion">
            <button className={`seg-btn${motion === "full" ? " on" : ""}`} role="radio" aria-checked={motion === "full"} onClick={() => setMotion("full")}>Full</button>
            <button className={`seg-btn${motion === "reduced" ? " on" : ""}`} role="radio" aria-checked={motion === "reduced"} onClick={() => setMotion("reduced")}>Reduced</button>
          </div>
        </div>
      </div>
    </section>
    </>
  );
}

function Appearance() {
  const theme = ui.use((s) => s.theme);
  const modes: { id: Theme; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ];
  return (
    <section className="grp">
      <p className="group-head">Mode</p>
      <div className="modes" role="radiogroup" aria-label="Mode">
        {modes.map((m) => (
          <button
            key={m.id}
            className={`mode${theme === m.id ? " on" : ""}`}
            role="radio"
            aria-checked={theme === m.id}
            onClick={() => setTheme(m.id)}
          >
            {m.id === "system" ? (
              <span className="swatch system" aria-hidden>
                <Swatch mode="light" />
                <Swatch mode="dark" half />
              </span>
            ) : (
              <Swatch mode={m.id} />
            )}
            <span className="mode-word">
              <span className="mode-check">
                <Icon icon={CheckIcon} size={11} strokeWidth={2.6} />
              </span>
              {m.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Swatch({ mode, half }: { mode: "light" | "dark"; half?: boolean }) {
  return (
    <span className={`swatch ${mode}${half ? " half" : ""}`} aria-hidden>
      <span className="sw-side" />
      <span className="sw-pane">
        <span className="sw-line" />
        <span className="sw-line short" />
      </span>
    </span>
  );
}


/** Doodle's own environment for FLUX, made on a key — uv's words as it works */
function SetUpLocal({ onDone }: { onDone: () => void }) {
  const [line, setLine] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const go = () => {
    setFailed(null);
    setLine("Starting…");
    setUpLocal((l) => setLine(l))
      .then(() => (setLine(null), onDone()))
      .catch((e) => (setLine(null), setFailed(String(e))));
  };
  return (
    <div className="prov-act">
      <button className="pill pill-sm" onClick={go} disabled={line !== null}>
        {line !== null ? "Setting up…" : "Set up"}
      </button>
      {line && <p className="prov-fix px">{line.slice(0, 90)}</p>}
      {failed && <p className="group-note">{failed}</p>}
    </div>
  );
}

function Providers() {
  const [found, setFound] = useState<Record<string, Found> | null>(null);
  const [looking, setLooking] = useState(false);
  const look = () => {
    setLooking(true);
    probe()
      .then(setFound)
      .finally(() => setLooking(false));
  };
  useEffect(look, []);
  return (
    <section className="grp">
      <p className="group-head">Who answers</p>
      <div className="group">
        {providers.map((p) => {
          const f = found?.[p.descriptor.id];
          return (
            <div key={p.descriptor.id} className="group-row prov">
              <div className="group-what">
                <p className="group-name">{p.descriptor.name}</p>
                <p className="group-note">{f?.says ?? "Looking…"}</p>
                {f?.fix && <p className="prov-fix px">{f.fix}</p>}
                {f?.then && <p className="group-note">{f.then}</p>}
                {f?.action === "set-up-local" && <SetUpLocal onDone={look} />}
                {f?.where && <p className={`prov-where${/[/:]/.test(f.where) ? " px" : ""}`}>{/[/:]/.test(f.where) ? f.where.replace(/^\/Users\/[^/]+/, "~") : `From ${f.where}`}</p>}
              </div>
              <span className={`chip${f?.ready ? " on" : ""}`}>{f?.chip ?? "…"}</span>
            </div>
          );
        })}
      </div>
      <div className="prov-foot">
        <p className="group-note under">Who draws and who writes is chosen on the Queue's chevron. A writer's ask goes to ChatGPT when it is here, else Ollama, else the mock.</p>
        <button className="pill pill-sm" onClick={look} disabled={looking}>
          {looking ? "Looking…" : "Look again"}
        </button>
      </div>
    </section>
  );
}

function About() {
  const [v, setV] = useState("");
  useEffect(() => {
    if (inTauri) import("@tauri-apps/api/app").then((a) => a.getVersion()).then(setV, () => undefined);
  }, []);
  return (
    <section className="grp about">
      <div className="about-mark" aria-hidden>
        <span className="sys">DD</span>
      </div>
      <p className="about-name">
        Doodle <span className="px about-v">{v}</span>
      </p>
      <p className="group-note">A recursively zoomable creative document. Built on The Soft Machine.</p>
    </section>
  );
}
