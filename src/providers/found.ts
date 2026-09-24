/**
 * What each provider was found to be on this Mac, in a sentence, and what
 * to do when it is not ready — the line to type where there is one. The
 * Providers screen and the first run's welcome both say this.
 */
import { providers, statusOf, lookAgain } from "./registry";
import { ollamaFound, ollamaWhere } from "./ollama";
import { codexStatus, type CodexStatus } from "./codex";
import type { ProviderStatus } from "./types";
import { inTauri } from "../platform/fs";

const WORD: Record<ProviderStatus, string> = { available: "Ready", unavailable: "Not running", "needs-auth": "Not signed in", unknown: "…" };

export interface Found {
  chip: string;
  ready: boolean;
  says: string;
  where?: string;
  fix?: string;
  then?: string;
}

/** a model's name as a person would say it: `hf.co/someone/chandra-ocr-2-GGUF:Q4_K_M` → chandra-ocr-2 */
/** the writer to pull: Hemmingway-1, the best prose that fits a laptop (HANDOFF.md, 2026-09-24) */
const PULL = "ollama pull hf.co/bartowski/Altworld_Hemmingway-1-GGUF:Q6_K";

const said = (m: string) => m.replace(/^hf\.co\/[^/]+\//, "").replace(/-GGUF(?=:|$)/i, "").replace(/:(latest|Q\d\w*)$/i, "");

/** where a binary came from, by the folder it is in */
function source(path?: string) {
  if (!path) return undefined;
  if (path.includes("/node_modules/@openai/codex")) return "npm, installed globally";
  if (path.startsWith("/Applications/ChatGPT.app")) return "the ChatGPT app";
  if (path.startsWith("/opt/homebrew") || path.startsWith("/usr/local/bin")) return "Homebrew";
  return path.replace(/^\/Users\/[^/]+/, "~");
}

export async function probe(): Promise<Record<string, Found>> {
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
        ? { chip: "Nothing to write with", ready: false, says: `Running, but no model here writes prose${rest.length ? ` (${rest.join(", ")} read, not write)` : ""}.`, fix: PULL }
        : at
          ? { chip: "Not running", ready: false, says: "Installed, but not running.", where: at, then: "Open Ollama from Applications, then look again." }
          : { chip: "Not installed", ready: false, says: "Models on this Mac, free and private. Install it from ollama.com, then pull one that writes:", fix: PULL };

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

