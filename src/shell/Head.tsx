import {
  Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CloseIcon,
  MoreIcon,
  RunIcon,
  CopyIcon,
  MenuIcon,
} from "../icons";
import { ui, togglePanes } from "../state/ui";

/** The title line. Everything centres on y 30, where the lights are. The
 *  boring menus are on the platform's bar; only the work is here. */
export function Head() {
  const panes = ui.use((s) => s.navigator || s.inspector);
  return (
    <header className="head" data-tauri-drag-region>
      <div className="lights-room" data-tauri-drag-region />

      <div className="spacer" data-tauri-drag-region />

      <div className="doc">
        <button className="pill-icon" aria-label="Previous document">
          <Icon icon={ChevronLeftIcon} size={14} strokeWidth={2} />
        </button>
        <button className="pill doc-tab">
          Black bear
          <span className="x" role="button" aria-label="Close document">
            <Icon icon={CloseIcon} size={11} strokeWidth={2.2} />
          </span>
        </button>
        <button className="pill-icon" aria-label="Next document">
          <Icon icon={ChevronRightIcon} size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="spacer" data-tauri-drag-region />

      <div className="tools">
        <button className="pill-icon" aria-label="More">
          <Icon icon={MoreIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill pill-ink queue">
          <Icon icon={RunIcon} size={13} strokeWidth={2.2} />
          Queue
          <span className="n">1</span>
          <Icon icon={ChevronDownIcon} size={12} strokeWidth={2.2} />
        </button>
        <button className="pill-icon" aria-label="Clear queue">
          <Icon icon={CloseIcon} size={14} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Duplicate">
          <Icon icon={CopyIcon} size={14} strokeWidth={2} />
        </button>
        <button
          className="pill-icon"
          aria-label="Panes"
          aria-pressed={panes}
          onClick={togglePanes}
        >
          <Icon icon={MenuIcon} size={15} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
