import { Icon, PlusIcon, MinusIcon, FitIcon, EyeIcon, LinkIcon } from "../icons";

/** The tool rail down the right edge: zoom, fit, reveal, lens. */
export function Rail() {
  return (
    <div className="rail card">
      <button className="pill-icon" aria-label="Zoom in">
        <Icon icon={PlusIcon} size={15} strokeWidth={2} />
      </button>
      <button className="pill-icon" aria-label="Zoom out">
        <Icon icon={MinusIcon} size={15} strokeWidth={2} />
      </button>
      <div className="gap" />
      <button className="pill-icon" aria-label="Fit to view">
        <Icon icon={FitIcon} size={14} strokeWidth={2} />
      </button>
      <button className="pill-icon" aria-label="Reveal">
        <Icon icon={EyeIcon} size={15} strokeWidth={2} />
      </button>
      <button className="pill-icon" aria-label="Lens">
        <Icon icon={LinkIcon} size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
