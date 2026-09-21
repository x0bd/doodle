/**
 * Every provider Doodle knows, and which one answers a capability. Mock
 * answers everything until a real one is chosen in settings.
 */
import { mock } from "./mock";
import { ollama } from "./ollama";
import type { Capability, Provider } from "./types";

export const providers: Provider[] = [mock, ollama];

export function providerFor(cap: Capability): Provider {
  return providers.find((p) => p.descriptor.id === "mock" && p.descriptor.capabilities.includes(cap)) ?? mock;
}
