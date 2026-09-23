import { useEffect, useState } from "react";
import { Icon, CloseIcon, CheckIcon, GeneralIcon, AppearanceIcon, AboutIcon, ProvidersIcon } from "../icons";
import { ui, closeSettings, setTheme, setMotion, openShortcuts, type Theme } from "../state/ui";
import { providers, statusOf, lookAgain } from "../providers/registry";
import { ollamaFound, ollamaWhere } from "../providers/ollama";
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

/** what each provider was found to be, in a sentence, and what to do when
 *  it is not ready — the command to run where there is one */
interface Found {
  chip: string;
  ready: boolean;
  says: string;
  where?: string;
  fix?: string;
  then?: string;
}

/** a model's name as a person would say it: `hf.co/someone/chandra-ocr-2-GGUF:Q4_K_M` → chandra-ocr-2 */
const said = (m: string) => m.replace(/^hf\.co\/[^/]+\//, "").replace(/-GGUF(?=:|$)/i, "").replace(/:(latest|Q\d\w*)$/i, "");

/** where a binary came from, by the folder it is in */
function source(path?: string) {
  if (!path) return undefined;
  if (path.includes("/node_modules/@openai/codex")) return "npm, installed globally";
  if (path.startsWith("/Applications/ChatGPT.app")) return "the ChatGPT app";
  if (path.startsWith("/opt/homebrew") || path.startsWith("/usr/local/bin")) return "Homebrew";
  return path.replace(/^\/Users\/[^/]+/, "~");
}

async function probe(): Promise<Record<string, Found>> {
  lookAgain();
  const [mockS, olS, cxS] = await Promise.all(providers.map((p) => statusOf(p)));
  void mockS;
  const out: Record<string, Found> = {
    mock: { chip: "Ready", ready: true, says: "Always here. Renders the bear, writes a paragraph, takes its time — for trying things without spending anything." },
  };

  // Ollama: not here, here but closed, open with nothing that writes, ready
  const ol = ollamaFound();
  const at = ol.answered ? null : await ollamaWhere().catch(() => null);
  const writers = ol.models.filter((m) => m.writes).map((m) => said(m.name));
  const rest = ol.models.filter((m) => !m.writes).map((m) => said(m.name));
  out.ollama =
    olS === "available"
      ? { chip: "Ready", ready: true, says: `Writes with ${writers.join(", ")}.${rest.length ? ` Also here: ${rest.join(", ")}.` : ""}`, where: "localhost:11434" }
      : ol.answered
        ? { chip: "Nothing to write with", ready: false, says: `Running, but no model here writes prose${rest.length ? ` (${rest.join(", ")} read, not write)` : ""}.`, fix: "ollama pull qwen3:14b" }
        : at
          ? { chip: "Not running", ready: false, says: "Installed, but not running.", where: at, then: "Open Ollama from Applications, then look again." }
          : { chip: "Not installed", ready: false, says: "Models on this Mac, free and private. Install it from ollama.com, then pull one that writes:", fix: "ollama pull qwen3:14b" };

  // ChatGPT through Codex: not found, found but signed out, ready
  const cx: CodexStatus | null = inTauri ? await codexStatus().catch(() => null) : null;
  out.codex = !cx?.found
    ? {
        chip: "Not found",
        ready: false,
        says: "Writes and draws on your ChatGPT subscription through the Codex CLI. Looked in Homebrew, npm's global folder, the ChatGPT app and ~/.local/bin; install it with",
        fix: "npm install -g @openai/codex@latest",
        then: "then codex login in Terminal, and look again.",
      }
    : cxS === "needs-auth"
      ? { chip: WORD["needs-auth"], ready: false, says: `${cx.version ?? "Codex"} is here, not signed in. In Terminal:`, where: source(cx.path), fix: "codex login" }
      : { chip: "Ready", ready: true, says: `${cx.version ?? "Codex"} · ${cx.auth === "chatgpt" ? "your ChatGPT account" : `signed in with ${cx.auth}`}. Every call carries Codex's own preamble.`, where: source(cx.path) };
  return out;
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
