import { useEffect, useState } from "react";
import { Icon, CloseIcon, CheckIcon, GeneralIcon, AppearanceIcon, AboutIcon, ProvidersIcon } from "../icons";
import { ui, closeSettings, setTheme, setMotion, openShortcuts, type Theme } from "../state/ui";
import { providers, statusOf } from "../providers/registry";
import { codexStatus, type CodexStatus } from "../providers/codex";
import type { ProviderStatus } from "../providers/types";
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

const WORD: Record<ProviderStatus, string> = { available: "Ready", unavailable: "Not running", "needs-auth": "Not signed in", unknown: "…" };

function Providers() {
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [cx, setCx] = useState<CodexStatus | null>(null);
  useEffect(() => {
    let live = true;
    providers.forEach((p) => statusOf(p).then((s) => live && setStatus((x) => ({ ...x, [p.descriptor.id]: s }))));
    if (inTauri) codexStatus().then((s) => live && setCx(s)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const notes: Record<string, string> = {
    mock: "Always here. Renders the bear, writes a paragraph, takes its time.",
    ollama: "Models on this Mac. Writes when a llama, gemma, qwen or mistral is installed — ollama pull llama3.2.",
    codex: cx?.found
      ? `${cx.version ?? "Codex"} at ${cx.path?.replace(/^\/Applications\//, "")} · ${cx.auth === "chatgpt" ? "your ChatGPT account" : cx.auth ? `signed in with ${cx.auth}` : "run codex login"}`
      : "The ChatGPT app or the Codex CLI. Writes and draws on your subscription; every call carries Codex's own preamble.",
  };
  return (
    <section className="grp">
      <p className="group-head">Who answers</p>
      <div className="group">
        {providers.map((p) => (
          <div key={p.descriptor.id} className="group-row">
            <div className="group-what">
              <p className="group-name">{p.descriptor.name}</p>
              <p className="group-note">{notes[p.descriptor.id]}</p>
            </div>
            <span className={`chip${status[p.descriptor.id] === "available" ? " on" : ""}`}>{WORD[status[p.descriptor.id] ?? "unknown"]}</span>
          </div>
        ))}
      </div>
      <p className="group-note under">Pick who draws on the Model node and who writes on a Write node. The writer's ask goes to ChatGPT when it is here, else Ollama, else the mock.</p>
    </section>
  );
}

function About() {
  return (
    <section className="grp about">
      <div className="about-mark" aria-hidden>
        <span className="sys">DD</span>
      </div>
      <p className="about-name">
        Doodle <span className="px about-v">0.1.0</span>
      </p>
      <p className="group-note">A recursively zoomable creative document. Built on The Soft Machine.</p>
    </section>
  );
}
