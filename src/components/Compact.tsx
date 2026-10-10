import { forwardRef, type CSSProperties, type MouseEvent as RMouseEvent } from "react";
import { money } from "../lib/money";
import { dueTag, methodOf, type DueWindow } from "../lib/rules";
import type { AppState, ISODate, Subscription } from "../lib/types";
import { CreditCard, Ellipsis, STROKE } from "./icons";
import { DueChip, Monogram } from "./ui";

interface Common {
  state: AppState;
  today: ISODate;
  upcoming: Subscription[];
  style: CSSProperties;
  menuOpen: boolean;
  onMenu: (anchor: HTMLElement) => void;
  onMouseDown: (e: RMouseEvent) => void;
  onContextMenu: (e: RMouseEvent) => void;
}

function MenuButton({ open, onMenu }: { open: boolean; onMenu: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      className="compact-menu"
      aria-label="Widget menu"
      aria-haspopup="menu"
      aria-expanded={open}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onMenu(e.currentTarget);
      }}
    >
      <Ellipsis size={14} strokeWidth={STROKE} />
    </button>
  );
}

/** Medium · 360 × 170 — the 30-day headline plus the next three payments. */
export const MediumWidget = forwardRef<HTMLDivElement, Common & { due: DueWindow }>(function MediumWidget(p, ref) {
  const cur = p.state.settings.currency;
  const total = p.due.total || 1;
  return (
    <div
      ref={ref}
      className="widget widget--medium"
      style={p.style}
      data-fit
      role="button"
      tabIndex={0}
      aria-label={`Due in 30 days ${money(p.due.total, cur)}. Open the full widget.`}
      onMouseDown={p.onMouseDown}
      onContextMenu={p.onContextMenu}
    >
      <div className="medium__total">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="t-cap12m c-secondary">Due in 30 days</span>
          <span className="t-metric32 num nowrap">{money(p.due.total, cur)}</span>
          <span className="t-cap12 c-tertiary">
            {p.due.count === 0 ? "nothing due" : `${p.due.count} payment${p.due.count === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="split split--6" aria-hidden>
          {p.due.byMethod.map((m) => (
            <div key={m.method.id} className={`split__seg mc-${m.method.color}`} style={{ flexGrow: m.total / total, flexBasis: 0 }} />
          ))}
          {!p.due.byMethod.length && <div className="split__seg" style={{ flex: 1, background: "var(--bg-muted)" }} />}
        </div>
      </div>
      <div className="medium__divider" />
      <div className="medium__next">
        <span className="t-cap12m c-tertiary">Next up</span>
        {p.upcoming.slice(0, 3).map((s) => (
          <div key={s.id} className="mini-row">
            <Monogram name={s.name} tile={s.tile} size={26} />
            <span className="t-cap12m ellipsis" style={{ flex: 1 }}>
              {s.name}
            </span>
            <DueChip {...dueTag(s.nextDate, p.today)} />
          </div>
        ))}
        {!p.upcoming.length && <span className="t-cap12 c-tertiary">No payments yet. Click to add one.</span>}
      </div>
      <MenuButton open={p.menuOpen} onMenu={p.onMenu} />
    </div>
  );
});

/** Small · 170 × 170 — only the next payment. */
export const SmallWidget = forwardRef<HTMLDivElement, Common & { due: DueWindow }>(function SmallWidget(p, ref) {
  const cur = p.state.settings.currency;
  const next = p.upcoming[0];
  const method = next ? methodOf(p.state, next.methodId) : undefined;
  // "N more in 30 days" = the other payments in the headline window.
  const more = next && next.nextDate <= p.due.to ? p.due.count - 1 : p.due.count;
  return (
    <div
      ref={ref}
      className="widget widget--small"
      style={p.style}
      data-fit
      role="button"
      tabIndex={0}
      aria-label={next ? `Next payment ${next.name} ${money(next.amount, cur)}. Open the full widget.` : "Open the full widget"}
      onMouseDown={p.onMouseDown}
      onContextMenu={p.onContextMenu}
    >
      {next ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Monogram name={next.name} tile={next.tile} />
            <DueChip {...dueTag(next.nextDate, p.today)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="t-cap12 c-tertiary ellipsis">Next payment{method ? ` · ${method.name}` : ""}</span>
            <span className="t-body14m ellipsis">{next.name}</span>
            <span className="t-metric24 num nowrap">{money(next.amount, cur)}</span>
          </div>
          <span className="t-cap12 c-tertiary">{more > 0 ? `${more} more in 30 days` : "Nothing else in 30 days"}</span>
        </>
      ) : (
        <>
          <div className="app-icon">
            <CreditCard size={16} strokeWidth={STROKE} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="t-body14m">No payments yet</span>
            <span className="t-cap12 c-tertiary">Click to add your first subscription.</span>
          </div>
        </>
      )}
      <MenuButton open={p.menuOpen} onMenu={p.onMenu} />
    </div>
  );
});
