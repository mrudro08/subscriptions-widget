// Every number in the widget comes from here. The rules mirror the
// "Definitions for developers" table in the Figma file (v2).

import {
  addDays,
  addMonthsAnchored,
  diffDays,
  fmtShort,
  fmtWeekday,
  monthEnd,
  monthKey,
  monthStart,
  parse,
} from "./dates";
import { money } from "./money";
import type { AppState, Charge, ISODate, LeadDays, PaymentMethod, Subscription } from "./types";

export const WINDOW_DAYS = 30;
const MAX_STEPS = 1200; // safety net for loops (100 years of monthly renewals)

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** The renewal after `date` for this plan. */
export function nextAfter(sub: Pick<Subscription, "cycle" | "anchorDay">, date: ISODate): ISODate {
  return addMonthsAnchored(date, sub.cycle === "monthly" ? 1 : 12, sub.anchorDay);
}

export function prevBefore(sub: Pick<Subscription, "cycle" | "anchorDay">, date: ISODate): ISODate {
  return addMonthsAnchored(date, sub.cycle === "monthly" ? -1 : -12, sub.anchorDay);
}

/** Renewal dates of a subscription between from and to (inclusive), starting at nextDate. */
export function occurrences(sub: Subscription, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let d = sub.nextDate;
  for (let i = 0; i < MAX_STEPS && d <= to; i++) {
    if (d >= from) out.push(d);
    d = nextAfter(sub, d);
  }
  return out;
}

export function active(state: AppState): Subscription[] {
  return state.subscriptions.filter((s) => s.status === "active");
}

export function methodOf(state: AppState, id: string): PaymentMethod | undefined {
  return state.methods.find((m) => m.id === id);
}

// ───────────────────────── Roll-forward ─────────────────────────

/**
 * At local midnight after a renewal date: record the charge in history, then
 * move the date one cycle. Catches up every missed renewal if the app was
 * closed. Cancelled subscriptions don't roll.
 */
export function rollForward(state: AppState, today: ISODate): { state: AppState; added: Charge[] } {
  const added: Charge[] = [];
  const subscriptions = state.subscriptions.map((s) => {
    if (s.status !== "active" || s.nextDate >= today) return s;
    let next = s.nextDate;
    let last: ISODate | undefined;
    for (let i = 0; i < MAX_STEPS && next < today; i++) {
      added.push({ id: uid("chg"), subId: s.id, date: next, amount: s.amount, methodId: s.methodId });
      last = next;
      next = nextAfter(s, next);
    }
    return { ...s, nextDate: next, lastChargedAt: last ?? s.lastChargedAt };
  });
  if (!added.length) return { state, added };
  return { state: { ...state, subscriptions, charges: [...state.charges, ...added] }, added };
}

/** Restoring a cancelled plan skips the renewals that passed while it was cancelled. */
export function restoredNextDate(sub: Subscription, today: ISODate): ISODate {
  let d = sub.nextDate;
  for (let i = 0; i < MAX_STEPS && d < today; i++) d = nextAfter(sub, d);
  return d;
}

/** Past charges from "Paying since" up to (not including) the next payment. */
export function backfillCharges(sub: Subscription, since: ISODate, today: ISODate): Charge[] {
  const out: Charge[] = [];
  let d = prevBefore(sub, sub.nextDate);
  for (let i = 0; i < MAX_STEPS && d >= since; i++) {
    if (d < today) out.push({ id: uid("chg"), subId: sub.id, date: d, amount: sub.amount, methodId: sub.methodId });
    d = prevBefore(sub, d);
  }
  return out.reverse();
}

// ───────────────────────── Headline: next 30 days ─────────────────────────

export interface MethodDue {
  method: PaymentMethod;
  total: number;
  count: number;
  next: ISODate;
}

export interface DueWindow {
  from: ISODate;
  to: ISODate;
  total: number;
  count: number;
  byMethod: MethodDue[];
}

const UNKNOWN_METHOD: PaymentMethod = { id: "", name: "No method", color: "gray" };

/** Charges dated today → today + 29 at full amount, active subscriptions only. */
export function dueWindow(state: AppState, today: ISODate, subs: Subscription[] = active(state)): DueWindow {
  const from = today;
  const to = addDays(today, WINDOW_DAYS - 1);
  const groups = new Map<string, MethodDue>();
  let total = 0;
  let count = 0;
  for (const s of subs) {
    for (const d of occurrences(s, from, to)) {
      total += s.amount;
      count++;
      const g = groups.get(s.methodId) ?? {
        method: methodOf(state, s.methodId) ?? UNKNOWN_METHOD,
        total: 0,
        count: 0,
        next: d,
      };
      g.total += s.amount;
      g.count++;
      if (d < g.next) g.next = d;
      groups.set(s.methodId, g);
    }
  }
  const byMethod = [...groups.values()].sort((a, b) => a.next.localeCompare(b.next) || b.total - a.total);
  return { from, to, total, count, byMethod };
}

// ───────────────────────── Yearly cost ─────────────────────────

/** Σ(monthly × 12) + Σ(yearly). The only annualised number in the widget. */
export function yearlyCost(subs: Subscription[]): number {
  return subs.reduce((sum, s) => sum + (s.cycle === "monthly" ? s.amount * 12 : s.amount), 0);
}

export function yearlyOf(sub: Subscription): number {
  return sub.cycle === "monthly" ? sub.amount * 12 : sub.amount;
}

// ───────────────────────── Charged per month (chart) ─────────────────────────

export interface MonthBar {
  month: ISODate; // first day of month
  total: number;
  charged: number;
  stillDue: number;
  current: boolean;
  /** False for months before anything was tracked. */
  tracked: boolean;
  /** Yearly plans charged this month (labelled on the spike). */
  yearly: string[];
}

export interface Chart {
  bars: MonthBar[];
  current: MonthBar;
  previous: MonthBar;
  average: number | null;
  trackedMonths: number;
}

export function trackingStart(state: AppState): ISODate | null {
  let start: ISODate | null = null;
  for (const s of state.subscriptions) if (!start || s.createdAt < start) start = s.createdAt;
  for (const c of state.charges) if (!start || c.date < start) start = c.date;
  return start;
}

/**
 * Sum of charges dated inside each calendar month, at full amount. Current
 * month = already charged + still due this month. Last 12 months.
 */
export function chart(state: AppState, today: ISODate): Chart {
  const start = trackingStart(state);
  const startMonth = start ? monthKey(start) : monthKey(today);
  const curKey = monthKey(today);
  const byMonth = new Map<string, { sum: number; yearly: Set<string> }>();
  const subById = new Map(state.subscriptions.map((s) => [s.id, s]));
  const add = (key: string, amount: number, sub?: Subscription) => {
    const e = byMonth.get(key) ?? { sum: 0, yearly: new Set<string>() };
    e.sum += amount;
    if (sub?.cycle === "yearly") e.yearly.add(sub.name);
    byMonth.set(key, e);
  };
  for (const c of state.charges) add(monthKey(c.date), c.amount, subById.get(c.subId));

  let stillDue = 0;
  const dueYearly: string[] = [];
  for (const s of active(state)) {
    for (const _d of occurrences(s, today, monthEnd(today))) {
      stillDue += s.amount;
      if (s.cycle === "yearly") dueYearly.push(s.name);
    }
  }

  const bars: MonthBar[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = monthStart(today, -i);
    const key = monthKey(m);
    const e = byMonth.get(key);
    const current = key === curKey;
    const charged = e?.sum ?? 0;
    bars.push({
      month: m,
      charged,
      stillDue: current ? stillDue : 0,
      total: charged + (current ? stillDue : 0),
      current,
      tracked: key >= startMonth,
      yearly: [...(e?.yearly ?? []), ...(current ? dueYearly : [])],
    });
  }
  const tracked = bars.filter((b) => b.tracked);
  const average = tracked.length >= 2 ? Math.round(tracked.reduce((s, b) => s + b.total, 0) / tracked.length) : null;
  return { bars, current: bars[11], previous: bars[10], average, trackedMonths: tracked.length };
}

// ───────────────────────── Due tag ─────────────────────────

export type Tone = "urgent" | "soon" | "normal";

/** 0–2 days → red, 3–7 → amber, later → neutral date. */
export function dueTag(date: ISODate, today: ISODate): { label: string; tone: Tone } {
  const n = diffDays(today, date);
  if (n <= 0) return { label: "Today", tone: "urgent" };
  if (n === 1) return { label: "Tomorrow", tone: "urgent" };
  if (n === 2) return { label: "In 2 days", tone: "urgent" };
  if (n <= 7) return { label: `In ${n} days`, tone: "soon" };
  return { label: fmtShort(date), tone: "normal" };
}

/** Rows show "charged Oct 12 ✓" for 3 days after a renewal was recorded. */
export function recentlyCharged(sub: Subscription, today: ISODate): ISODate | null {
  if (!sub.lastChargedAt) return null;
  const n = diffDays(sub.lastChargedAt, today);
  return n >= 1 && n <= 3 ? sub.lastChargedAt : null;
}

// ───────────────────────── Lists ─────────────────────────

export function upcoming(state: AppState): Subscription[] {
  return active(state).sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name));
}

export function cancelled(state: AppState): Subscription[] {
  return state.subscriptions
    .filter((s) => s.status === "cancelled")
    .sort((a, b) => (b.cancelledAt ?? "").localeCompare(a.cancelledAt ?? "") || a.name.localeCompare(b.name));
}

// ───────────────────────── Per-subscription history ─────────────────────────

export interface SubStats {
  since: ISODate;
  last12: number;
  count12: number;
  methods: string[];
}

export function subStats(state: AppState, sub: Subscription, today: ISODate): SubStats {
  const charges = state.charges.filter((c) => c.subId === sub.id);
  const yearAgo = addDays(today, -365);
  const recent = charges.filter((c) => c.date > yearAgo);
  const since = charges.reduce((min, c) => (c.date < min ? c.date : min), sub.createdAt);
  const methodIds = [...new Set(recent.map((c) => c.methodId))];
  return {
    since,
    last12: recent.reduce((s, c) => s + c.amount, 0),
    count12: recent.length,
    methods: methodIds.map((id) => methodOf(state, id)?.name ?? "a removed method"),
  };
}

// ───────────────────────── Reminders ─────────────────────────

export interface ReminderToast {
  key: string[]; // reminder keys this toast covers
  tag: string; // "sub:<id>" or "group:<date>"
  title: string;
  body: string;
  actions: { id: string; label: string }[];
}

function whenLabel(lead: LeadDays): string {
  return lead === 0 ? "today" : lead === 1 ? "tomorrow" : "in 3 days";
}

export function reminderKey(subId: string, due: ISODate): string {
  return `${subId}:${due}`;
}

/** The moment a renewal's reminder is due: (date − lead) at the reminder time. */
export function reminderDate(due: ISODate, lead: LeadDays): ISODate {
  return addDays(due, -lead);
}

/**
 * Reminders that should fire now. Sent on the reminder day once the clock
 * passes the reminder time (so if the PC was off at 9:00, it goes out at the
 * next launch that day). Same-day renewals merge into one notification.
 */
export function dueReminders(state: AppState, now: Date, today: ISODate): ReminderToast[] {
  const { enabled, lead, time } = state.settings.reminders;
  if (!enabled) return [];
  const [h, m] = time.split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return [];
  const due = addDays(today, lead);
  const sent = new Set(state.sentReminders);
  const subs = active(state).filter((s) => occurrences(s, due, due).length && !sent.has(reminderKey(s.id, due)));
  if (!subs.length) return [];
  return [buildToast(state, subs, due, lead)];
}

export function buildToast(state: AppState, subs: Subscription[], due: ISODate, lead: LeadDays): ReminderToast {
  const cur = state.settings.currency;
  const when = whenLabel(lead);
  const keys = subs.map((s) => reminderKey(s.id, due));
  if (subs.length === 1) {
    const s = subs[0];
    const method = methodOf(state, s.methodId)?.name;
    return {
      key: keys,
      tag: `sub:${s.id}`,
      title: `${s.name} renews ${when}`,
      body: `${money(s.amount, cur)}${method ? ` from ${method}` : ""} · ${fmtWeekday(due)}`,
      actions: [
        { id: "open", label: "Open" },
        { id: "cancel", label: "Mark as cancelled" },
      ],
    };
  }
  const sorted = [...subs].sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, x) => s + x.amount, 0);
  const named = sorted.map((s) => `${s.name} ${money(s.amount, cur)}`);
  const list =
    named.length === 2 ? `${named[0]} and ${named[1]}` : `${named[0]}, ${named[1]} and ${named.length - 2} more`;
  const methods = new Set(sorted.map((s) => s.methodId));
  const methodName = methods.size === 1 ? methodOf(state, sorted[0].methodId)?.name : undefined;
  return {
    key: keys,
    tag: `group:${due}`,
    title: `${subs.length} renewals ${when}`,
    body: `${list} · ${money(total, cur)} ${methodName ? `from ${methodName}` : "total"}`,
    actions: [{ id: "open", label: "Open" }],
  };
}

/** Keeps the sent-reminder log small: drop keys for renewals more than a week old. */
export function pruneSent(sent: string[], today: ISODate): string[] {
  const cutoff = addDays(today, -7);
  return sent.filter((k) => (k.split(":")[1] ?? "") >= cutoff);
}

/** "Reminder Nov 3 at 9:00 AM (1 day before)" */
export function reminderHint(state: AppState, due: ISODate, today: ISODate, fmtTime: (t: string) => string): string {
  const { enabled, lead, time } = state.settings.reminders;
  if (!enabled) return "Reminders are off · turn them on in Settings";
  const r = reminderDate(due, lead);
  const leadText = lead === 0 ? "on the day" : lead === 1 ? "1 day before" : "3 days before";
  if (r < today) return `No reminder · it's sooner than your ${leadText} setting`;
  return `Reminder ${fmtShort(r)} at ${fmtTime(time)} (${leadText})`;
}

export function yearOf(date: ISODate): number {
  return parse(date).y;
}
