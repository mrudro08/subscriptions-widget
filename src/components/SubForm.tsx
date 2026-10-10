import { useEffect, useMemo, useRef, useState } from "react";
import { POPULAR, tileFor } from "../lib/catalog";
import { addDays, diffDays, fmtLong, fmtMonthYear, fmtShort, fmtTime, isValidISO, relativeDays } from "../lib/dates";
import { amountInput, currencySymbol, money, parseAmount } from "../lib/money";
import { active, dueWindow, reminderHint, subStats, WINDOW_DAYS } from "../lib/rules";
import { useStore, type SubInput } from "../lib/store";
import type { Cycle, ISODate, Subscription } from "../lib/types";
import { Bell, Calendar, Check, Plus, STROKE, Trash2, X } from "./icons";
import { MethodEditor } from "./MethodEditor";
import { DeleteConfirm } from "./SubList";
import { Monogram, Segmented } from "./ui";

interface Props {
  sub?: Subscription; // edit when set
  prefillName?: string;
  onClose: () => void;
  onAdded: (s: Subscription) => void;
  onDeleted: (s: Subscription) => void;
}

/** Add and Edit share this form (Figma screens 6 and 7). */
export function SubForm({ sub, prefillName, onClose, onAdded, onDeleted }: Props) {
  const store = useStore();
  const { state, today } = store;
  const cur = state.settings.currency;
  const editing = !!sub;

  const defaultMethod = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of active(state)) counts.set(s.methodId, (counts.get(s.methodId) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return best && state.methods.some((m) => m.id === best) ? best : state.methods[0]?.id ?? "";
  }, [state]);

  const [name, setName] = useState(sub?.name ?? prefillName ?? "");
  const [amount, setAmount] = useState(sub ? amountInput(sub.amount) : "");
  const [cycle, setCycle] = useState<Cycle>(sub?.cycle ?? "monthly");
  const [nextDate, setNextDate] = useState<ISODate>(sub?.nextDate ?? "");
  const [since, setSince] = useState<ISODate>("");
  const [methodId, setMethodId] = useState(sub?.methodId ?? defaultMethod);
  const [addingMethod, setAddingMethod] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tried, setTried] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sub) (prefillName ? amountRef : nameRef).current?.focus();
  }, [prefillName, sub]);

  const cents = parseAmount(amount);
  const errors = {
    name: !name.trim() ? "Enter the platform name" : null,
    amount: cents == null ? "Enter an amount, e.g. 9.99" : null,
    date: !isValidISO(nextDate)
      ? "Pick the next payment date"
      : nextDate < today && (!editing || nextDate !== sub?.nextDate)
        ? "Pick today or a later date"
        : null,
    since: since && isValidISO(nextDate) && since >= nextDate ? "Must be before the next payment" : null,
    method: !methodId ? "Choose how it's paid" : null,
  };
  const valid = !Object.values(errors).some(Boolean);

  const taken = new Set(state.subscriptions.map((s) => s.name.toLowerCase()));
  const picks = POPULAR.filter((n) => !taken.has(n.toLowerCase()) && n.toLowerCase() !== name.trim().toLowerCase()).slice(0, 4);

  const submit = () => {
    setTried(true);
    if (!valid || cents == null) return;
    const input: SubInput = { name, amount: cents, cycle, nextDate, methodId, since: since || undefined };
    if (sub) {
      store.editSub(sub.id, input);
      onClose();
    } else {
      onAdded(store.addSub(input));
    }
  };

  // Impact preview (Add) uses the same 30-day definition as the headline.
  const preview = useMemo(() => {
    if (editing || cents == null || !isValidISO(nextDate)) return null;
    const draft: Subscription = {
      id: "draft", name, amount: cents, cycle, nextDate, anchorDay: Number(nextDate.slice(8)),
      methodId, tile: "gray", status: "active", createdAt: today,
    };
    const w = dueWindow(state, today, [...active(state), draft]);
    const m = w.byMethod.find((x) => x.method.id === methodId);
    const inWindow = diffDays(today, nextDate) < WINDOW_DAYS;
    return { total: w.total, method: m, inWindow };
  }, [editing, cents, nextDate, cycle, methodId, name, state, today]);

  const stats = sub ? subStats(state, sub, today) : null;
  const showErr = (k: keyof typeof errors) => tried && errors[k];

  return (
    <div
      className="form-screen"
      style={{ display: "contents" }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && !addingMethod) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="header header--sub">
        <button type="button" className="icon-btn icon-btn--outline" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          <X size={16} strokeWidth={STROKE} />
        </button>
        <span className="t-title16">{editing ? "Edit subscription" : "Add subscription"}</span>
      </div>

      <div className="widget__scroll scroll" style={{ margin: "-18px -20px", padding: "18px 20px", flex: "0 1 auto" }}>
        <div className="form">
          {/* Platform */}
          <div className="field">
            <label className="field__label t-cap12m c-secondary" htmlFor="f-name">
              Platform
            </label>
            <div className={`input${showErr("name") ? " is-invalid" : ""}`}>
              <Monogram name={name} tile={name.trim() ? (sub && sub.name === name ? sub.tile : tileFor(name)) : "gray"} size={28} />
              <input
                id="f-name"
                ref={nameRef}
                value={name}
                maxLength={60}
                placeholder="e.g. Netflix"
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {showErr("name") && <span className="t-cap12 field__error">{errors.name}</span>}
            {!editing && picks.length > 0 && (
              <div className="picks">
                {picks.map((p) => (
                  <button
                    type="button"
                    key={p}
                    className="pick t-cap12m"
                    onClick={() => {
                      setName(p);
                      amountRef.current?.focus();
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="field">
            <div className="field__label">
              <label className="t-cap12m c-secondary" htmlFor="f-amount">
                Amount
              </label>
              <span className="t-cap12 c-tertiary">base currency</span>
            </div>
            <div className={`input${showErr("amount") ? " is-invalid" : ""}`}>
              <span className="t-body14 c-tertiary">{currencySymbol(cur)}</span>
              <input
                id="f-amount"
                ref={amountRef}
                value={amount}
                inputMode="decimal"
                placeholder="0.00"
                autoComplete="off"
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                onBlur={() => cents != null && setAmount(amountInput(cents))}
              />
              <span className="t-cap12m c-tertiary">{cur}</span>
            </div>
            {showErr("amount") && <span className="t-cap12 field__error">{errors.amount}</span>}
          </div>

          {/* Repeats */}
          <div className="field">
            <span className="t-cap12m c-secondary">Repeats</span>
            <Segmented
              size="lg"
              value={cycle}
              onChange={setCycle}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
          </div>

          {/* Next payment */}
          <div className="field">
            <div className="field__label">
              <label className="t-cap12m c-secondary" htmlFor="f-next">
                Next payment
              </label>
              {isValidISO(nextDate) && <span className="t-cap12 c-tertiary">{relativeDays(today, nextDate)}</span>}
            </div>
            <DateInput
              id="f-next"
              value={nextDate}
              min={editing && sub && sub.nextDate < today ? sub.nextDate : today}
              invalid={!!showErr("date")}
              placeholder="Pick a date"
              onChange={setNextDate}
            />
            {showErr("date") ? (
              <span className="t-cap12 field__error">{errors.date}</span>
            ) : (
              isValidISO(nextDate) && (
                <span className="hint t-cap12">
                  <Bell size={13} strokeWidth={STROKE} />
                  {reminderHint(state, nextDate, today, fmtTime)}
                </span>
              )
            )}
          </div>

          {/* Paying since (Add only, optional) */}
          {!editing && (
            <div className="field">
              <div className="field__label">
                <label className="t-cap12m c-secondary" htmlFor="f-since">
                  Paying since
                </label>
                <span className="t-cap12 c-tertiary">optional</span>
              </div>
              <DateInput
                id="f-since"
                value={since}
                max={isValidISO(nextDate) ? addDays(nextDate, -1) : today}
                invalid={!!showErr("since")}
                placeholder="Not set"
                onChange={setSince}
                onClear={() => setSince("")}
              />
              {showErr("since") ? (
                <span className="t-cap12 field__error">{errors.since}</span>
              ) : (
                <span className="t-cap12 c-tertiary">Adds your past payments to the monthly chart.</span>
              )}
            </div>
          )}

          {/* Pay with */}
          <div className="field">
            <div className="field__label">
              <span className="t-cap12m c-secondary">Pay with</span>
              <span className="t-cap12 c-tertiary">used at renewal</span>
            </div>
            {addingMethod ? (
              <MethodEditor
                existingNames={state.methods.map((m) => m.name)}
                onCancel={() => setAddingMethod(false)}
                onSave={(m) => {
                  store.saveMethod(m);
                  setMethodId(m.id);
                  setAddingMethod(false);
                }}
              />
            ) : (
              <div className="picks" role="radiogroup" aria-label="Pay with">
                {state.methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={m.id === methodId}
                    aria-pressed={m.id === methodId}
                    className="method-chip t-cap12m"
                    onClick={() => setMethodId(m.id)}
                  >
                    <span className={`dot mc-${m.color}`} />
                    {m.name}
                    {m.id === methodId && <Check size={12} strokeWidth={2.25} />}
                  </button>
                ))}
                <button type="button" className="method-chip t-cap12m" onClick={() => setAddingMethod(true)}>
                  <Plus size={12} strokeWidth={2} />
                  Other
                </button>
              </div>
            )}
            {showErr("method") && !addingMethod && <span className="t-cap12 field__error">{errors.method}</span>}
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="preview-box">
            <div>
              <span className="t-cap12 c-tertiary">Due in the next 30 days</span>
              <span className="t-title16 num">{money(preview.total, cur)}</span>
            </div>
            <div>
              <span className="t-cap12m nowrap">
                +{money(cents!, cur)} on {fmtShort(nextDate)}
              </span>
              <span className="t-cap12 c-tertiary nowrap">
                {preview.inWindow && preview.method
                  ? `${preview.method.method.name} now needs ${money(preview.method.total, cur)}`
                  : "after the 30-day window"}
              </span>
            </div>
          </div>
        )}
        {stats && (
          <div className="preview-box">
            <div>
              <span className="t-cap12 c-tertiary">Tracked since {fmtMonthYear(stats.since)}</span>
              <span className="t-body14m num nowrap">{money(stats.last12, cur)} in the last 12 months</span>
            </div>
            <div>
              <span className="t-cap12m nowrap">
                {stats.count12} charge{stats.count12 === 1 ? "" : "s"}
              </span>
              <span className="t-cap12 c-tertiary nowrap">
                {stats.methods.length === 0 ? "none recorded yet" : stats.methods.length === 1 ? `all via ${stats.methods[0]}` : `via ${stats.methods.length} methods`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {confirmDelete && sub ? (
        <DeleteConfirm sub={sub} state={state} onKeep={() => setConfirmDelete(false)} onConfirm={() => onDeleted(sub)} />
      ) : (
        <div className="btn-row" style={{ flexShrink: 0 }}>
          {editing ? (
            <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={18} strokeWidth={STROKE} />
              Delete
            </button>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Discard
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={submit}>
            {editing ? "Save changes" : "Add subscription"}
          </button>
        </div>
      )}
    </div>
  );
}

function DateInput({
  id,
  value,
  min,
  max,
  invalid,
  placeholder,
  onChange,
  onClear,
}: {
  id: string;
  value: ISODate;
  min?: ISODate;
  max?: ISODate;
  invalid?: boolean;
  placeholder: string;
  onChange: (v: ISODate) => void;
  onClear?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`input input--date${invalid ? " is-invalid" : ""}`}
      onClick={() => {
        try {
          ref.current?.showPicker();
        } catch {
          ref.current?.focus();
        }
      }}
    >
      <Calendar size={16} strokeWidth={STROKE} />
      <span className={`t-body14 ${value ? "" : "c-tertiary"}`} style={{ flex: 1 }}>
        {value && isValidISO(value) ? fmtLong(value) : placeholder}
      </span>
      {onClear && value && (
        <button
          type="button"
          className="icon-btn icon-btn--ghost"
          style={{ position: "relative", zIndex: 1, width: 24, height: 24 }}
          aria-label="Clear date"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          <X size={14} strokeWidth={STROKE} />
        </button>
      )}
      <input
        id={id}
        ref={ref}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        tabIndex={0}
      />
    </div>
  );
}
