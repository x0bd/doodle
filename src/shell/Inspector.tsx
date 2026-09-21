import { Icon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, DiceIcon } from "../icons";

/** The right pane: what the selection is, and its every setting. */
export function Inspector() {
  return (
    <aside className="pane right card" aria-label="Inspector">
      <div className="pane-head">
        <div>
          <div className="pane-title">Image Generator</div>
          <div className="pane-note">Generator · mock</div>
        </div>
      </div>
      <div className="pane-body">
        <div className="group-head">Sampling</div>
        <div className="group">
          <Row name="Randomness">
            <span className="px">12345</span>
            <button className="pill-icon sm" aria-label="New seed">
              <Icon icon={DiceIcon} size={13} strokeWidth={2} />
            </button>
          </Row>
          <Row name="Control mode">
            <Select>Fixed</Select>
          </Row>
          <Row name="Quality steps">
            <Stepper>30</Stepper>
          </Row>
          <Row name="Prompt strength">
            <Stepper>8.0</Stepper>
          </Row>
          <Row name="Sampling method">
            <Select>dpm++ 2M</Select>
          </Row>
        </div>

        <div className="group-head">Output</div>
        <div className="group">
          <Row name="Size">
            <span className="px">1024 × 1024</span>
          </Row>
          <Row name="Scale">
            <Select>2×</Select>
          </Row>
          <Row name="Format">
            <Select>PNG</Select>
          </Row>
        </div>
      </div>
    </aside>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="group-row">
      <div className="group-what">
        <div className="group-name">{name}</div>
      </div>
      <div className="group-ctl">{children}</div>
    </div>
  );
}

function Select({ children }: { children: string }) {
  return (
    <button className="pill pill-sm">
      {children}
      <Icon icon={ChevronDownIcon} size={11} strokeWidth={2.2} />
    </button>
  );
}

function Stepper({ children }: { children: string }) {
  return (
    <div className="seg">
      <button className="seg-btn key" aria-label="Less">
        <Icon icon={ChevronLeftIcon} size={11} strokeWidth={2.2} />
      </button>
      <span className="seg-val px">{children}</span>
      <button className="seg-btn key" aria-label="More">
        <Icon icon={ChevronRightIcon} size={11} strokeWidth={2.2} />
      </button>
    </div>
  );
}
