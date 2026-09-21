import { useEffect, useState } from "react";
import { Icon, CheckIcon } from "../icons";
import { providers, statusOf } from "../providers/registry";
import type { ProviderStatus } from "../providers/types";
import { ui, setDrawWith, setWriteWith } from "../state/ui";

const WORD: Record<ProviderStatus, string> = { available: "", unavailable: "not running", "needs-auth": "not signed in", unknown: "…" };

/** Who draws and who writes when Queue is pressed. Remembered. */
export function QueueMenu({ onClose }: { onClose: () => void }) {
  const { drawWith, writeWith } = ui.use();
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});

  useEffect(() => {
    let live = true;
    providers.forEach((p) => statusOf(p).then((s) => live && setStatus((x) => ({ ...x, [p.descriptor.id]: s }))));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    const onDown = (e: PointerEvent) => !(e.target as HTMLElement).closest(".qmenu, .queue-more") && onClose();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const rows = (cap: "image.generate" | "text.generate", chosen: string, set: (id: string) => void) =>
    providers
      .filter((p) => p.descriptor.capabilities.includes(cap))
      .map((p) => {
        const id = p.descriptor.id;
        const st = status[id];
        const on = chosen === id;
        return (
          <button key={id} className={`list-row${on ? " on" : ""}`} role="menuitemradio" aria-checked={on} onClick={() => set(id)}>
            <span className="list-check">
              <Icon icon={CheckIcon} size={12} strokeWidth={2.4} />
            </span>
            <span className="list-word">{p.descriptor.name}</span>
            {st && st !== "available" && <span className="list-key">{WORD[st]}</span>}
          </button>
        );
      });

  return (
    <div className="qmenu card" role="menu" aria-label="Run with">
      <div className="list">
        <div className="list-head">Draw with</div>
        {rows("image.generate", drawWith, setDrawWith)}
        <div className="list-gap" />
        <div className="list-head">Write with</div>
        {rows("text.generate", writeWith, setWriteWith)}
      </div>
    </div>
  );
}
