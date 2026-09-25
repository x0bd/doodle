/**
 * The provider port. Doodle asks for a capability, not a vendor; an
 * adapter answers in these terms and nothing of its own leaks past here.
 */
export type Capability = "image.generate" | "text.generate";

export interface ProviderDescriptor {
  id: string;
  name: string;
  capabilities: Capability[];
}

export type ProviderStatus = "available" | "unavailable" | "needs-auth" | "unknown";

/** a picture shown to a model with the words: whose it is, and where to
 *  find it — a file for a provider that reads files, the bytes (a data URL,
 *  1024 on the long side) for one that takes them inline. `ref` is the
 *  document's own reference, kept so a request can be read again later. */
export interface Picture {
  label: string;
  ref: string;
  path?: string;
  data?: string;
}

export interface ImageRequest {
  prompt: string;
  negative: string;
  model: string;
  seed: number;
  steps: number;
  strength: number;
  sampler: string;
  width: number;
  height: number;
  /** references for how someone or somewhere looks */
  images?: Picture[];
}

export interface ImageResult {
  /** a URL the webview can show — a fixture, a data URL, or later an asset path */
  asset: string;
  seed: number;
  elapsedMs: number;
}

export interface TextRequest {
  prompt: string;
  system?: string;
  model?: string;
  /** a JSON Schema the answer must match, for providers that can promise it */
  schema?: unknown;
  /** how many tokens of context a long request needs (a local model's window is small unless asked) */
  context?: number;
  /** whether a model that thinks first should (off: faster, for a structured answer) */
  think?: boolean;
  /** pictures to look at with the words (vision) */
  images?: Picture[];
  /** Doodle's own tools for this turn (agent/tools.ts): a provider that
   *  speaks MCP is handed Doodle's server; one that does not may call
   *  `runTool` directly */
  tools?: boolean;
  /** what the agent is told about where it is, when it has the tools */
  instructions?: string;
  runTool?: (name: string, args: Record<string, unknown>) => ToolAnswer | Promise<ToolAnswer>;
  /** the tools themselves, for a provider that is handed them by
   *  description and calls back (Ollama's tool calling) */
  toolSpecs?: ToolSpec[];
  /** a tool reached for, as it happens */
  onTool?: (name: string) => void;
}

/** what a tool said, and whether it went wrong */
export interface ToolAnswer {
  text: string;
  error: boolean;
}

/** a tool as a model is told about it */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Progress {
  /** 0..1 */
  fraction: number;
  /** what is happening, for the readout */
  note?: string;
}

export interface Provider {
  descriptor: ProviderDescriptor;
  status(): Promise<ProviderStatus>;
  generateImage?(req: ImageRequest, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<ImageResult>;
  generateText?(req: TextRequest, signal: AbortSignal): Promise<string>;
  /** the same, with the words as they arrive */
  streamText?(req: TextRequest, onDelta: (text: string) => void, signal: AbortSignal): Promise<string>;
}
