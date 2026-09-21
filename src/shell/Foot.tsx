import { Icon, SettingsIcon, PlusIcon, MinusIcon, FitIcon, EyeIcon, LinkIcon } from "../icons";
import { openSettings } from "../state/ui";

/** The foot of the field: settings and the readouts on the left, the view
 *  cluster on the right. */
export function Foot() {
  return (
    <>
      <div className="foot-l">
        <button className="pill-icon" aria-label="Settings" title="Settings — ⌘," onClick={openSettings}>
          <Icon icon={SettingsIcon} size={15} strokeWidth={2} />
        </button>
        <div className="readout" aria-hidden>
          <span><span className="k">T</span>0.00s</span>
          <span><span className="k">I</span>0</span>
          <span><span className="k">N</span>10</span>
        </div>
      </div>

      <div className="cluster card">
        <button className="pill-icon" aria-label="Fit to view">
          <Icon icon={FitIcon} size={14} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Reveal">
          <Icon icon={EyeIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Lens">
          <Icon icon={LinkIcon} size={15} strokeWidth={2} />
        </button>
        <span className="gap" />
        <button className="pill-icon" aria-label="Zoom out">
          <Icon icon={MinusIcon} size={15} strokeWidth={2} />
        </button>
        <span className="fig">60%</span>
        <button className="pill-icon" aria-label="Zoom in">
          <Icon icon={PlusIcon} size={15} strokeWidth={2} />
        </button>
      </div>
    </>
  );
}
