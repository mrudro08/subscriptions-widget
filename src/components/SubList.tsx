import { useEffect, useRef, useState } from "react";
import { fmtShort } from "../lib/dates";
import { money } from "../lib/money";
import { dueTag, methodOf, recentlyCharged, yearlyOf } from "../lib/rules";
import type { AppState, ISODate, Subscription } from "../lib/types";
import { Check, CircleAlert, Ellipsis, STROKE, Trash2 } from "./icons";
import { Dot, DueChip, Monogram } from "./ui";

export type Confirm = { kind: "cancel" | "delete"; id: string } | null;

interface Props {
  items: Subscription[];
  tab: "upcoming" | "cancelled";
  state: AppState;
  today: ISODate;
  confirm: Confirm;
  menuId: string | null;
  flashId: string | null;
  toastOpen: boolean;
  onEdit: (id: string) => void;
  onMenu: (id: string, at: { x: number; y: number } | null, row: HTMLElement) => void;
  onAskDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onConfirm: () => void;
  onDismissConfirm: () => void;
}

export function SubList(p: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const cur = p.state.settings.currency;

  // Bring a row into view (notification click, keyboard focus, inline confirm).
  const target = p.confirm?.id ?? p.flashId;
  useEffect(() => {
    if (!target) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${target}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (p.flashId && !p.confirm) {
      setActiveId(p.flashId);
      el?.focus({ preventScroll: true });
    }
  }, [target, p.flashId, p.confirm]);

  const focusRow = (id: string) => {
    setActiveId(id);
    listRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, s: Subscription, i: number) => {
    const row = e.currentTarget as HTMLElement;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = p.items[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) focusRow(next.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      p.onEdit(s.id);
    } else if (e.key === "Delete") {
      e.preventDefault();
      p.onAskDelete(s.id);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      p.onMenu(s.id, null, row);
    }
  };

  if (!p.items.length) {
    return (
      <div className="list-empty t-body13 c-tertiary">
        {p.tab === "upcoming" ? "Nothing upcoming. Add a subscription with +." : "Nothing cancelled. Items you cancel move here and can be restored."}
      </div>
    );
  }

  const tabStop = p.items.some((s) => s.id === activeId) ? activeId : p.items[0].id;

  return (
    <div
      ref={listRef}
      className={`list scroll${p.toastOpen ? " list--toast" : ""}`}
      role="list"
      aria-label={p.tab === "upcoming" ? "Upcoming payments, due first" : "Cancelled subscriptions"}
    >
      {p.items.map((s, i) => {
        if (p.confirm?.id === s.id) {
          return p.confirm.kind === "cancel" ? (
            <CancelConfirm key={s.id} sub={s} state={p.state} onKeep={p.onDismissConfirm} onConfirm={p.onConfirm} />
          ) : (
            <DeleteConfirm key={s.id} sub={s} state={p.state} onKeep={p.onDismissConfirm} onConfirm={p.onConfirm} />
          );
        }
        const method = methodOf(p.state, s.methodId);
        const charged = recentlyCharged(s, p.today);
        const cancelledRow = s.status === "cancelled";
        const tag = dueTag(s.nextDate, p.today);
        return (
          <div
            key={s.id}
            data-id={s.id}
            role="listitem"
            tabIndex={s.id === tabStop ? 0 : -1}
            className={`row${cancelledRow ? " row--cancelled" : ""}${p.menuId === s.id ? " is-menu" : ""}${p.flashId === s.id ? " is-flash" : ""}`}
            aria-label={`${s.name}, ${money(s.amount, cur)}, ${cancelledRow ? "cancelled" : `due ${fmtShort(s.nextDate)}`}`}
            onFocus={() => setActiveId(s.id)}
            onDoubleClick={() => p.onEdit(s.id)}
            onKeyDown={(e) => onKeyDown(e, s, i)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              p.onMenu(s.id, { x: e.clientX, y: e.clientY }, e.currentTarget);
            }}
          >
            <Monogram name={s.name} tile={cancelledRow ? "gray" : s.tile} />
            <div className="row__text">
              <span className={`t-body14m ellipsis${cancelledRow ? " c-tertiary" : ""}`}>{s.name}</span>
              <span className="row__meta">
                {method && <Dot color={method.color} size={6} />}
                <span className="t-cap12 c-tertiary ellipsis">
                  {method && !cancelledRow ? `${method.name} · ` : ""}
                  {cancelledRow
                    ? `Cancelled ${fmtShort(s.cancelledAt ?? p.today)}`
                    : charged
                      ? `charged ${fmtShort(charged)}`
                      : s.cycle === "monthly"
                        ? "Monthly"
                        : "Yearly"}
                </span>
                {charged && !cancelledRow && <Check size={12} strokeWidth={2} className="c-tertiary" aria-label="recorded" />}
              </span>
            </div>
            <div className="row__right">
              <span className={`t-body14m num${cancelledRow ? " c-tertiary" : ""}`}>{money(s.amount, cur)}</span>
              {cancelledRow ? (
                <button
                  type="button"
                  className="chip chip--restore"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onRestore(s.id);
                  }}
                >
                  Restore
                </button>
              ) : (
                <DueChip {...tag} />
              )}
            </div>
            <button
              type="button"
              className="icon-btn icon-btn--ghost row__menu"
              tabIndex={-1}
              aria-label={`Actions for ${s.name}`}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                p.onMenu(s.id, null, e.currentTarget.closest(".row") as HTMLElement);
              }}
            >
              <Ellipsis size={16} strokeWidth={STROKE} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CancelConfirm({ sub, state, onKeep, onConfirm }: { sub: Subscription; state: AppState; onKeep: () => void; onConfirm: () => void }) {
  const cur = state.settings.currency;
  const method = methodOf(state, sub.methodId);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="confirm" data-id={sub.id} role="alertdialog" aria-label={`Cancel ${sub.name}?`} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onKeep())}>
      <div className="confirm__top">
        <Monogram name={sub.name} tile={sub.tile} />
        <div className="row__text">
          <span className="t-body14m ellipsis">Cancel {sub.name}?</span>
          <span className="t-cap12 c-success">
            {money(sub.amount, cur)} a {sub.cycle === "monthly" ? "month" : "year"} · saves {money(yearlyOf(sub), cur)} a year
          </span>
        </div>
      </div>
      <div className="confirm__note">
        <CircleAlert size={14} strokeWidth={STROKE} />
        <span className="t-cap12 c-secondary">
          This only updates your tracker. Cancel on {sub.name} before {fmtShort(sub.nextDate)}
          {method ? ` so ${method.name} isn’t charged.` : " so you aren’t charged."}
        </span>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn--sm btn--secondary" onClick={onKeep}>
          Keep it
        </button>
        <button ref={ref} type="button" className="btn btn--sm btn--danger" onClick={onConfirm}>
          Mark as cancelled
        </button>
      </div>
    </div>
  );
}

export function DeleteConfirm({
  sub,
  state,
  onKeep,
  onConfirm,
}: {
  sub: Subscription;
  state: AppState;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const count = state.charges.filter((c) => c.subId === sub.id).length;
  return (
    <div className="confirm" data-id={sub.id} role="alertdialog" aria-label={`Delete ${sub.name}?`} style={{ gap: 10 }} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onKeep())}>
      <div className="confirm__title">
        <Trash2 size={16} strokeWidth={STROKE} />
        <span className="t-body14m ellipsis">Delete {sub.name}?</span>
      </div>
      <span className="t-cap12 c-secondary">
        {count > 0
          ? `This removes it and its ${count} past charge${count === 1 ? "" : "s"} from the chart and totals. It can’t be undone.`
          : "This removes it from your tracker. It can’t be undone."}
        {sub.status === "active" ? " To stop tracking but keep history, use Mark as cancelled." : ""}
      </span>
      <div className="btn-row">
        <button type="button" className="btn btn--sm btn--secondary" onClick={onKeep}>
          Keep
        </button>
        <button ref={ref} type="button" className="btn btn--sm btn--danger" onClick={onConfirm}>
          Delete
        </button>
      </div>
    </div>
  );
}
