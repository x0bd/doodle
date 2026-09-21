/** Mono reports in the corners: time and iteration on the left, nodes and scale on the right. */
export function Readouts() {
  return (
    <>
      <div className="readout l" aria-hidden>
        <div><span className="k">T</span>0.00s</div>
        <div><span className="k">I</span>0</div>
      </div>
      <div className="readout r" aria-hidden>
        <div><span className="k">N</span>10 (10)</div>
        <div><span className="k">S</span>60.24</div>
      </div>
    </>
  );
}
