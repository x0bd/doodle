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
