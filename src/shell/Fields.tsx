import { Icon, PopUpIcon, ChevronLeftIcon, ChevronRightIcon, DiceIcon } from "../icons";
import type { Field } from "../graph/kinds";
import type { CSSProperties } from "react";
import { updateData, type GraphNode } from "../state/graph";

/** One field of a node, as a group row: the inspector and the document share it. */
export function FieldRow({ node, field }: { node: GraphNode; field: Field }) {
  const v = node.data[field.key];
  const set = (val: string | number) => updateData(node.id, { [field.key]: val });

  if (field.type === "line") {
    return (
      <div className="group-row col">
        <div className="group-name">{field.label}</div>
        <input className="inp" value={String(v ?? "")} placeholder={field.label.toLowerCase()} onChange={(e) => set(e.target.value)} spellCheck={false} />
      </div>
    );
  }

  if (field.type === "text") {
    return (
      <div className="group-row col">
        <div className="group-name">{field.label}</div>
        <textarea
          className="inp"
          rows={field.rows ?? 4}
          value={String(v ?? "")}
          placeholder={field.label.toLowerCase()}
          onChange={(e) => set(e.target.value)}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="group-row">
      <div className="group-what">
        <div className="group-name">{field.label}</div>
      </div>
      <div className="group-ctl">
        {field.type === "seed" && (
          <>
            <span className="px">{String(v)}</span>
            <button className="pill-icon sm" aria-label="New seed" onClick={() => set(Math.floor(Math.random() * 1_000_000))}>
              <Icon icon={DiceIcon} size={13} strokeWidth={2} />
            </button>
          </>
        )}
        {field.type === "select" && (
          <label className="pill pill-sm select">
            <span>{String(v)}</span>
            <Icon icon={PopUpIcon} size={12} strokeWidth={2} />
            <select value={String(v)} onChange={(e) => set(e.target.value)} aria-label={field.label}>
              {field.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
        )}
        {field.type === "choice" && (
          <div className="seg" role="radiogroup" aria-label={field.label}>
            {field.options.map((o) => (
              <button key={o} className={`seg-btn key${String(v) === o ? " on" : ""}`} role="radio" aria-checked={String(v) === o} onClick={() => set(o)}>
                {o}
              </button>
            ))}
          </div>
        )}
        {field.type === "range" && (
          <label className="slide" style={{ "--at": `${((Number(v ?? field.min) - field.min) / (field.max - field.min)) * 100}%` } as CSSProperties}>
            <input
              type="range"
              min={field.min}
              max={field.max}
              step={field.step}
              value={Number(v ?? field.min)}
              onChange={(e) => set(round(Number(e.target.value), field.digits))}
              aria-label={field.label}
            />
            <span className="slide-fig px">
              {fmt(Number(v ?? field.min), field.digits)}
              {field.unit && <i>{field.unit}</i>}
            </span>
          </label>
        )}
        {field.type === "number" && (
          <div className="seg">
            <button
              className="seg-btn key"
              aria-label="Less"
              onClick={() => set(Math.max(field.min, round(Number(v) - field.step, field.digits)))}
            >
              <Icon icon={ChevronLeftIcon} size={11} strokeWidth={2.2} />
            </button>
            <span className="seg-val px">{fmt(Number(v), field.digits)}</span>
            <button
              className="seg-btn key"
              aria-label="More"
              onClick={() => set(Math.min(field.max, round(Number(v) + field.step, field.digits)))}
            >
              <Icon icon={ChevronRightIcon} size={11} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const round = (n: number, digits = 0) => Number(n.toFixed(digits));
const fmt = (n: number, digits = 0) => n.toFixed(digits);
