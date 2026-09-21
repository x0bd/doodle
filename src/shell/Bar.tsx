import {
  Icon,
  HistoryIcon,
  SaveIcon,
  ModelIcon,
  ImageIcon,
  GenerateIcon,
  SettingsIcon,
} from "../icons";

/** The prompt bar at the foot of the field. */
export function Bar() {
  return (
    <div className="bar card">
      <div className="bar-ask well">
        <span className="lbl">Prompt</span>
        <p>
          Minimalist illustration of a black bear with a pink snout, soft gradients, and smooth
          shapes, against a clear blue sky
        </p>
      </div>
      <div className="bar-acts">
        <button className="pill-icon on" aria-label="History">
          <Icon icon={HistoryIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Save">
          <Icon icon={SaveIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Model">
          <Icon icon={ModelIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Image">
          <Icon icon={ImageIcon} size={15} strokeWidth={2} />
        </button>
        <div className="gap" />
        <button className="pill-icon" aria-label="Generate">
          <Icon icon={GenerateIcon} size={15} strokeWidth={2} />
        </button>
        <button className="pill-icon" aria-label="Settings">
          <Icon icon={SettingsIcon} size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
