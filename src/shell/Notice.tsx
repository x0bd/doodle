import { notices, hush } from "../state/notice";
import { Icon, CloseIcon } from "../icons";

/** the one sentence Doodle has to say, under the head */
export function Notice() {
  const all = notices.use();
  const n = all[0];
  if (!n) return null;
  return (
    <div className="notice" role="status" key={n.id}>
      <span className="notice-text">{n.text}</span>
      {n.action && (
        <button
          className="pill pill-sm"
          onClick={() => {
            hush(n.id);
            n.action!.run();
          }}
        >
          {n.action.label}
        </button>
      )}
      {all.length > 1 && <span className="notice-more px">1 of {all.length}</span>}
      <button className="pill-icon notice-x" onClick={() => hush(n.id)} aria-label="Dismiss">
        <Icon icon={CloseIcon} size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
