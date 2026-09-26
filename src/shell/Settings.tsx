import { useEffect, useState } from "react";
import { Icon, CloseIcon, CheckIcon, GeneralIcon, AppearanceIcon, AboutIcon, ProvidersIcon, ModelIcon } from "../icons";
import { ui, closeSettings, setTheme, setMotion, setDim, setSpell, openShortcuts, type Theme } from "../state/ui";
import { providers } from "../providers/registry";
import { probe, type Found } from "../providers/found";
import { setUpLocal } from "../providers/local";
import { inTauri } from "../platform/fs";
import { MODELS, models, lookAtModels, fetchModel, stopModel, revealModel, modelPage, hasToken, setToken, forgetToken, gb, type ModelSpec } from "../state/models";

type Section = "general" | "appearance" | "providers" | "models" | "about";
const SECTIONS: { id: Section; label: string; icon: Parameters<typeof Icon>[0]["icon"] }[] = [
  { id: "general", label: "General", icon: GeneralIcon },
  { id: "appearance", label: "Appearance", icon: AppearanceIcon },
  { id: "providers", label: "Providers", icon: ProvidersIcon },
  { id: "models", label: "Models", icon: ModelIcon },
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
            {section === "models" && <Models />}
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


/** The models on this Mac (M4.2): what each is for and weighs, its licence,
 *  and bringing it down — with progress, a stop that keeps what came, and
 *  for a gated one, the licence to accept and the token to fetch it with. */
function Models() {
  const here = models.use();
  const [token, setTok] = useState<boolean | null>(null);
  useEffect(() => {
    void lookAtModels();
    void hasToken().then(setTok);
  }, []);
  if (!inTauri) return <p className="group-note">The models are managed in the installed app.</p>;
  return (
    <>
      <section className="grp">
        <p className="group-head">On this Mac</p>
        <div className="group">
          {MODELS.map((m) => (
            <ModelRow key={m.id} m={m} here={here[m.id]} token={!!token} />
          ))}
        </div>
        <p className="group-note under">Kept in Hugging Face's own cache (~/.cache/huggingface), where other tools find them too. A stopped download picks up where it was.</p>
      </section>
      <HfToken has={token} onChange={() => void hasToken().then(setTok)} />
    </>
  );
}

function ModelRow({ m, here, token }: { m: ModelSpec; here?: { whole: boolean; bytes: number; fetching: boolean; failed?: string; gated?: boolean }; token: boolean }) {
  const pct = here ? Math.min(100, Math.round((here.bytes / m.size) * 100)) : 0;
  return (
    <div className="group-row prov model-row">
      <div className="group-what">
        <p className="group-name">
          {m.name}
          <span className={`model-lic${m.commercial ? " ok" : ""}`}>{m.licence}{m.commercial ? " · commercial use" : ""}</span>
        </p>
        <p className="group-note">{m.does}</p>
        {!m.ready && <p className="group-note">Doodle draws with it once it learns it — soon; it can come down now.</p>}
        {m.gated && !here?.whole && (
          <p className="group-note">
            Hugging Face asks you to accept its licence first:{" "}
            <button className="link" onClick={() => void modelPage(m)}>
              the model's page
            </button>
            {token ? ", then Download." : " — and a token, below."}
          </p>
        )}
        {here?.fetching && (
          <div className="model-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.name} downloading`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        {here?.fetching && <p className="prov-fix px">{gb(here.bytes)} of {gb(m.size)} · {pct}%</p>}
        {here?.failed && <p className="group-note model-failed">{here.gated ? "Hugging Face would not give it: accept the licence on the model's page, and check the token." : here.failed}</p>}
      </div>
      <div className="model-acts">
        {here?.whole ? (
          <>
            <span className="chip on">Here</span>
            <button className="pill pill-sm" onClick={() => void revealModel(m)} title="Show it in the Finder">
              Show
            </button>
          </>
        ) : here?.fetching ? (
          <button className="pill pill-sm" onClick={() => void stopModel(m)} title="Stop — what came down stays">
            Stop
          </button>
        ) : (
          <button className="pill pill-sm" onClick={() => void fetchModel(m)} disabled={m.gated && !token} title={m.gated && !token ? "A Hugging Face token first" : `Bring down ${gb(m.size)}`}>
            {here && here.bytes > 1e8 ? `Resume · ${gb(m.size - here.bytes)}` : `Download · ${gb(m.size)}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** the writer's Hugging Face token, for gated models — into the Keychain, never shown again */
function HfToken({ has, onChange }: { has: boolean | null; onChange: () => void }) {
  const [value, setValue] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const save = () =>
    setToken(value)
      .then(() => (setValue(""), setSaid(null), onChange()))
      .catch((e) => setSaid(String(e)));
  return (
    <section className="grp">
      <p className="group-head">Hugging Face</p>
      <div className="group">
        <div className="group-row prov">
          <div className="group-what">
            <p className="group-name">Token</p>
            <p className="group-note">
              {has ? "Kept in your Keychain. Gated models are fetched with it." : "For gated models. Make a read token on huggingface.co (Settings › Access Tokens); Doodle keeps it in your Keychain."}
            </p>
            {!has && (
              <div className="model-token">
                <input className="inp" type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="hf_…" aria-label="Hugging Face token" spellCheck={false} autoComplete="off" />
                <button className="pill pill-sm" onClick={() => void save()} disabled={!value.trim()}>
                  Keep
                </button>
              </div>
            )}
            {said && <p className="group-note model-failed">{said}</p>}
          </div>
          {has && (
            <button className="pill pill-sm" onClick={() => void forgetToken().then(onChange)}>
              Forget
            </button>
          )}
        </div>
      </div>
    </section>
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
