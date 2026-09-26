"""
doodle-imaged (PLAN.md M4.1): Doodle's picture maker on this Mac — FLUX.2
through mflux (MLX), as a small process Doodle's Rust side starts and
supervises. It speaks JSON, one object a line: commands on stdin, events on
stdout. Nothing else goes to stdout; what it has to say for a person goes
to stderr (Doodle's log).

  → {"op": "hello"}                                   ← {"event": "ready", ...}
  → {"op": "load", "model": "flux2-klein-4b"}           ← {"event": "loaded", "model", "ms"}
  → {"id": "j1", "op": "generate", "model", "prompt", "seed", "steps",
     "width", "height", "images": [paths], "out": path}
                                                     ← {"id", "event": "progress", "step", "steps"} …
                                                     ← {"id", "event": "done", "path", "seed", "ms"}
                                                       | {"id", "event": "cancelled", "step"}
                                                       | {"id", "event": "error", "message"}
  → {"op": "cancel", "id": "j1"}                       (stops at the next step)
  → {"op": "unload"}                                  ← {"event": "unloaded"}
  → {"op": "quit"}

One model is resident at a time: FLUX.2 klein's edit variant, which also
draws from nothing — so a picture with references and one without are the
same weights. Commands are read on a thread of their own, so a cancel
arrives while a picture is being drawn.
"""

import json
import os
import queue
import sys
import threading
import time
import traceback

VERSION = "1"
# seconds of nothing to do before the model is let go
IDLE = 600
MODELS = {"flux2-klein-4b": "flux2_klein_4b", "flux2-klein-9b": "flux2_klein_9b"}

out_lock = threading.Lock()
# the protocol's own line; whatever a library prints goes to the log instead
PROTOCOL = sys.stdout
sys.stdout = sys.stderr
# a stand-in that draws a plain picture step by step, for testing without the weights
FAKE = os.environ.get("DOODLE_IMAGED_FAKE") == "1"


def say(obj):
    with out_lock:
        PROTOCOL.write(json.dumps(obj) + "\n")
        PROTOCOL.flush()


def note(text):
    sys.stderr.write(f"[imaged] {text}\n")
    sys.stderr.flush()


class Cancelled(Exception):
    pass


class State:
    def __init__(self):
        self.model = None
        self.name = None
        self.job = None  # the id being drawn
        self.cancel = threading.Event()


state = State()


class Progress:
    """An mflux in-loop callback: each step said, and a cancel honoured."""

    def __init__(self, job_id, steps):
        self.job_id = job_id
        self.steps = steps

    def call_in_loop(self, t, seed, prompt, latents, config, time_steps):
        if state.cancel.is_set():
            # mflux stops a run on an interruption, between steps
            raise KeyboardInterrupt()
        say({"id": self.job_id, "event": "progress", "step": int(t) + 1, "steps": self.steps})


class FakeModel:
    """Draws a flat picture in the prompt's colour, a step every fifth of a second — the protocol, without the weights."""

    class _Registry:
        def __init__(self):
            self.in_loop = []

        def register(self, cb):
            self.in_loop.append(cb)

    def __init__(self):
        self.callbacks = FakeModel._Registry()

    def generate_image(self, seed, prompt, num_inference_steps, width, height, image_paths=None):
        from PIL import Image

        for t in range(num_inference_steps):
            time.sleep(0.2)
            try:
                for cb in self.callbacks.in_loop:
                    cb.call_in_loop(t, seed, prompt, None, None, None)
            except KeyboardInterrupt:
                raise Cancelled()
        hue = sum(map(ord, prompt)) % 256

        class Out:
            image = Image.new("RGB", (width, height), (hue, 120, 255 - hue))

        return Out()


def load(name):
    if state.name == name and state.model is not None:
        return 0
    if name not in MODELS:
        raise ValueError(f"No model called {name}. Known: {', '.join(MODELS)}.")
    unload()
    t0 = time.time()
    if FAKE:
        state.model, state.name = FakeModel(), name
        return 0
    from mflux.models.common.config import ModelConfig
    from mflux.models.flux2.variants import Flux2KleinEdit

    state.model = Flux2KleinEdit(model_config=getattr(ModelConfig, MODELS[name])())
    state.name = name
    ms = int((time.time() - t0) * 1000)
    note(f"loaded {name} in {ms} ms")
    return ms


def unload():
    if state.model is None:
        return
    state.model = None
    state.name = None
    try:
        import gc

        import mlx.core as mx

        gc.collect()
        mx.clear_cache()
    except Exception:  # noqa: BLE001 — freeing is best-effort
        pass


def generate(cmd):
    job = cmd["id"]
    name = cmd.get("model") or "flux2-klein-4b"
    load(name)
    steps = int(cmd.get("steps") or 4)
    # the model draws in 16-pixel cells
    width = max(256, int(cmd.get("width") or 1024) // 16 * 16)
    height = max(256, int(cmd.get("height") or 1024) // 16 * 16)
    images = [p for p in (cmd.get("images") or []) if p]
    model = state.model
    progress = Progress(job, steps)
    # the last run's progress goes; this one's comes
    registry = model.callbacks
    registry.in_loop[:] = [c for c in registry.in_loop if not isinstance(c, Progress)]
    registry.register(progress)
    state.job = job
    state.cancel.clear()
    t0 = time.time()
    try:
        image = model.generate_image(
            seed=int(cmd.get("seed") or 0),
            prompt=cmd["prompt"],
            num_inference_steps=steps,
            width=width,
            height=height,
            image_paths=images or None,
        )
        image.image.save(cmd["out"])
        say({"id": job, "event": "done", "path": cmd["out"], "seed": int(cmd.get("seed") or 0), "ms": int((time.time() - t0) * 1000), "width": width, "height": height})
    except Exception as e:  # noqa: BLE001
        if state.cancel.is_set() or type(e).__name__ in ("StopImageGenerationException", "Cancelled"):
            say({"id": job, "event": "cancelled"})
        else:
            note(traceback.format_exc())
            say({"id": job, "event": "error", "message": str(e) or type(e).__name__})
    finally:
        state.job = None
        state.cancel.clear()


def reader(q):
    """Commands, read as they come: a cancel acts at once, the rest wait their turn."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError:
            say({"event": "error", "message": "A line that is not JSON."})
            continue
        if cmd.get("op") == "cancel":
            if state.job and (cmd.get("id") in (None, state.job)):
                state.cancel.set()
            continue
        q.put(cmd)
    q.put({"op": "quit"})


def main():
    q = queue.Queue()
    threading.Thread(target=reader, args=(q,), daemon=True).start()
    while True:
        try:
            # ten quiet minutes and the model lets go of its memory (M4.4) — the writer may want it
            cmd = q.get(timeout=IDLE)
        except queue.Empty:
            if state.model is not None:
                note(f"idle {IDLE}s: letting {state.name} go")
                unload()
                say({"event": "unloaded", "why": "idle"})
            continue
        op = cmd.get("op")
        try:
            if op == "hello":
                from importlib.metadata import version

                say({"event": "ready", "version": VERSION, "mflux": version("mflux"), "models": list(MODELS)})
            elif op == "load":
                ms = load(cmd.get("model") or "flux2-klein-4b")
                say({"event": "loaded", "model": state.name, "ms": ms})
            elif op == "generate":
                generate(cmd)
            elif op == "unload":
                unload()
                say({"event": "unloaded"})
            elif op == "quit":
                break
            else:
                say({"event": "error", "message": f"No command called {op}."})
        except Exception as e:  # noqa: BLE001
            note(traceback.format_exc())
            say({"id": cmd.get("id"), "event": "error", "message": str(e) or type(e).__name__})


if __name__ == "__main__":
    main()
