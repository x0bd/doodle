/**
 * Every provider Doodle knows, and which one answers a capability. A
 * request may name a preference ("Ollama"); if that provider is up it
 * answers, else the mock does and says so. Status is asked at most every
 * half minute.
 */
import { mock } from "./mock";
import { ollama } from "./ollama";
import { codex } from "./codex";
import type { Capability, Provider, ProviderStatus } from "./types";

export const providers: Provider[] = [mock, ollama, codex];

/** what a select's words mean, by provider id */
const NAMES: Record<string, string> = { chatgpt: "codex", codex: "codex", ollama: "ollama", mock: "mock" };

const status = new Map<string, { at: number; value: ProviderStatus }>();
const TTL = 30_000;

export async function statusOf(p: Provider): Promise<ProviderStatus> {
  const had = status.get(p.descriptor.id);
  if (had && Date.now() - had.at < TTL) return had.value;
  const value = await p.status();
  status.set(p.descriptor.id, { at: Date.now(), value });
  return value;
}

/** ask everyone again, now — something was installed, opened or signed into */
export function lookAgain() {
  status.clear();
}

/** The provider for a capability — the preferred one if it is available,
 *  else the mock — and whether that was a fallback. */
export async function pick(cap: Capability, prefer?: string): Promise<{ provider: Provider; fellBack: boolean }> {
  const want = prefer ? NAMES[prefer.toLowerCase().split(/[\s·(]/)[0]] : undefined;
  if (want && want !== "mock") {
    const p = providers.find((x) => x.descriptor.id === want && x.descriptor.capabilities.includes(cap));
    if (p && (await statusOf(p)) === "available") return { provider: p, fellBack: false };
    return { provider: mock, fellBack: !!p };
  }
  return { provider: mock, fellBack: false };
}

/** For callers that do not name a preference: the first real provider that
 *  is up, else the mock. */
export async function pickAny(cap: Capability): Promise<Provider> {
  // ChatGPT first — it writes best — then whatever else is up
  for (const p of [...providers].sort((a, b) => (a.descriptor.id === "codex" ? -1 : b.descriptor.id === "codex" ? 1 : 0))) {
    if (p.descriptor.id === "mock" || !p.descriptor.capabilities.includes(cap)) continue;
    if ((await statusOf(p)) === "available") return p;
  }
  return mock;
}

/** synchronous, for code that cannot wait: always the mock */
export function providerFor(cap: Capability): Provider {
  return providers.find((p) => p.descriptor.id === "mock" && p.descriptor.capabilities.includes(cap)) ?? mock;
}
