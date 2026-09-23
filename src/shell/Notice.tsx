import { notice, hush } from "../state/notice";
import { Icon, CloseIcon } from "../icons";

/** the one sentence Doodle has to say, under the head */
export function Notice() {
  const n = notice.use();
  if (!n) return null;
  return (
    <div className="notice" role="status" key={n.id}>
      <span className="notice-text">{n.text}</span>
      {n.action && (
        <button
          className="pill pill-sm"
          onClick={() => {
            hush();
            n.action!.run();
          }}
        >
          {n.action.label}
        </button>
      )}
      <button className="pill-icon notice-x" onClick={hush} aria-label="Dismiss">
        <Icon icon={CloseIcon} size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
