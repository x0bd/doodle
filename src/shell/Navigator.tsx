import { Icon, CheckIcon, PlusIcon, ModelIcon, TextIcon, GenerateIcon, ImageIcon, GraphIcon } from "../icons";

/** The left pane: where you are, and what is here. */
export function Navigator() {
  return (
    <aside className="pane left card" aria-label="Navigator">
      <div className="pane-head">
        <span className="pane-title">Black bear</span>
        <button className="pill-icon sm" aria-label="Add node">
          <Icon icon={PlusIcon} size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="pane-body">
        <div className="list">
          <div className="list-head">Graphs</div>
          <Row icon={GraphIcon} on>Black bear</Row>
          <Row icon={GraphIcon}>Fox study</Row>
          <Row icon={GraphIcon}>Untitled</Row>
          <div className="list-gap" />
          <div className="list-head">Nodes</div>
          <Row icon={ModelIcon}>Model</Row>
          <Row icon={TextIcon}>Prompt</Row>
          <Row icon={TextIcon}>Negative</Row>
          <Row icon={GenerateIcon} hl>Image Generator</Row>
          <Row icon={ImageIcon}>Preview</Row>
        </div>
      </div>
    </aside>
  );
}

function Row({
  icon,
  on,
  hl,
  children,
}: {
  icon: Parameters<typeof Icon>[0]["icon"];
  on?: boolean;
  hl?: boolean;
  children: string;
}) {
  return (
    <button className={`list-row${on ? " on" : ""}${hl ? " hl" : ""}`}>
      <Icon icon={icon} size={14} strokeWidth={1.8} />
      <span className="list-word">{children}</span>
      {on && (
        <span className="list-check">
          <Icon icon={CheckIcon} size={12} strokeWidth={2.4} />
        </span>
      )}
    </button>
  );
}
