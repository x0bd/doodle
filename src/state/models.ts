/**
 * The models Doodle can draw with on this Mac (PLAN.md M4.2, M4.3): what
 * each is for, what it weighs, under what licence its pictures may be
 * used, and which files of its Hugging Face repository it needs — the rest
 * (a single-file copy of a transformer, other sizes) is never fetched.
 * Whether each is here is asked of Rust (`models.rs`); bringing one down
 * is Rust's too, its progress heard as `models` events.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createStore } from "./store";
import { inTauri } from "../platform/fs";

export interface ModelSpec {
  id: string;
  name: string;
  /** what it is for, in a line */
  does: string;
  repo: string;
  /** what is fetched: only these files (patterns), or everything but these */
  include?: string[];
  exclude?: string[];
  /** the files that make it whole */
  need: string[];
  /** bytes, all told, of what is fetched */
  size: number;
  licence: string;
  commercial: boolean;
  /** Hugging Face asks the writer to accept its licence, and a token to fetch it */
  gated: boolean;
  /** drawn on this Mac today, or waiting for Doodle to learn it */
  ready: boolean;
}

export const MODELS: ModelSpec[] = [
  {
    id: "flux2-klein-4b",
    name: "FLUX.2 klein 4B",
    does: "Pictures from words and from references — the default. Four steps, ~7 s a picture here.",
    repo: "black-forest-labs/FLUX.2-klein-4B",
    exclude: ["flux-2-klein-4b.safetensors"],
    need: ["transformer/diffusion_pytorch_model.safetensors", "text_encoder/model-00001-of-00002.safetensors", "text_encoder/model-00002-of-00002.safetensors", "vae/diffusion_pytorch_model.safetensors"],
    size: 15.96e9,
    licence: "Apache 2.0",
    commercial: true,
    gated: false,
    ready: true,
  },
  {
    id: "flux2-klein-9b",
    name: "FLUX.2 klein 9B",
    does: "The same, with more care — finer faces and hands, slower and twice the memory.",
    repo: "black-forest-labs/FLUX.2-klein-9B",
    exclude: ["flux-2-klein-9b.safetensors"],
    need: [
      "transformer/diffusion_pytorch_model-00001-of-00002.safetensors",
      "transformer/diffusion_pytorch_model-00002-of-00002.safetensors",
      "text_encoder/model-00004-of-00004.safetensors",
      "vae/diffusion_pytorch_model.safetensors",
    ],
    size: 34.74e9,
    licence: "FLUX Non-Commercial",
    commercial: false,
    gated: true,
    ready: false,
  },
  {
    id: "ideogram-4",
    name: "Ideogram 4",
    does: "Lettering and layout — a cover, a sign, a title that reads.",
    repo: "ideogram-ai/ideogram-4-fp8",
    need: ["transformer/diffusion_pytorch_model.safetensors", "unconditional_transformer/diffusion_pytorch_model.safetensors", "text_encoder/model.safetensors"],
    size: 27.5e9,
    licence: "Ideogram 4 Non-Commercial",
    commercial: false,
    gated: true,
    ready: false,
  },
  {
    id: "seedvr2-3b",
    name: "SeedVR2 3B",
    does: "Upscaling — a kept picture to 2× or 4×, its detail made, not stretched.",
    repo: "numz/SeedVR2_comfyUI",
    include: ["seedvr2_ema_3b_fp16.safetensors", "ema_vae_fp16.safetensors"],
    need: ["seedvr2_ema_3b_fp16.safetensors", "ema_vae_fp16.safetensors"],
    size: 7.28e9,
    licence: "Apache 2.0",
    commercial: true,
    gated: false,
    ready: false,
  },
];

export interface Here {
  whole: boolean;
  bytes: number;
  fetching: boolean;
  /** what went wrong, the last time */
  failed?: string;
  gated?: boolean;
}

/** how each model stands on this Mac, by id */
export const models = createStore<Record<string, Here>>({});

export async function lookAtModels() {
  if (!inTauri) return;
  const next: Record<string, Here> = {};
  for (const m of MODELS) next[m.id] = { ...models.get()[m.id], ...(await invoke<Here>("model_present", { id: m.id, repo: m.repo, need: m.need })) };
  models.set(next);
}

let listening = false;
function hear() {
  if (listening || !inTauri) return;
  listening = true;
  void listen<{ id: string; event: string; bytes?: number; message?: string; gated?: boolean }>("models", (e) => {
    const { id, event, bytes, message, gated } = e.payload;
    models.set((s) => {
      const had = s[id] ?? { whole: false, bytes: 0, fetching: false };
      if (event === "progress") return { ...s, [id]: { ...had, bytes: bytes ?? had.bytes, fetching: true, failed: undefined } };
      if (event === "done") return { ...s, [id]: { ...had, whole: true, fetching: false } };
      if (event === "stopped") return { ...s, [id]: { ...had, fetching: false } };
      return { ...s, [id]: { ...had, fetching: false, failed: message, gated } };
    });
  });
}

export async function fetchModel(m: ModelSpec) {
  hear();
  models.set((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? { whole: false, bytes: 0 }), fetching: true, failed: undefined } }));
  try {
    await invoke("model_fetch", { id: m.id, repo: m.repo, include: m.include ?? [], exclude: m.exclude ?? [], need: m.need });
  } catch (e) {
    models.set((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? { whole: false, bytes: 0 }), fetching: false, failed: String(e) } }));
  }
}

export const stopModel = (m: ModelSpec) => invoke("model_stop", { id: m.id });
export const revealModel = (m: ModelSpec) => invoke("model_reveal", { repo: m.repo });
export const modelPage = (m: ModelSpec) => invoke("model_page", { repo: m.repo });
export const hasToken = () => (inTauri ? invoke<boolean>("hf_token_has") : Promise.resolve(false));
export const setToken = (value: string) => invoke("hf_token_set", { value });
export const forgetToken = () => invoke("hf_token_forget");

/** "15.9 GB" */
export const gb = (b: number) => `${(b / 1e9).toFixed(b < 10e9 ? 1 : 0)} GB`;
