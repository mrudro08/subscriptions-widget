import type { ISODate } from "./types";

// All date maths runs on plain calendar dates (no time, no time zone) so that
// DST changes and the PC's clock offset can never shift a renewal by a day.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parse(iso: ISODate): YMD {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function iso(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function toUTC(date: ISODate): number {
  const { y, m, d } = parse(date);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * 86_400_000);
}

/** Whole days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Same day-of-month `months` later, clamped to month end (Jan 31 → Feb 28). */
export function addMonthsAnchored(date: ISODate, months: number, anchorDay: number): ISODate {
  const { y, m } = parse(date);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return iso(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

/** First day of the month `offset` months from `date`'s month. */
export function monthStart(date: ISODate, offset = 0): ISODate {
  return addMonthsAnchored(iso(parse(date).y, parse(date).m, 1), offset, 1);
}

export function monthEnd(date: ISODate): ISODate {
  const { y, m } = parse(date);
  return iso(y, m, daysInMonth(y, m));
}

export function monthName(date: ISODate): string {
  return MONTHS[parse(date).m - 1];
}

export function monthShort(date: ISODate): string {
  return monthName(date).slice(0, 3);
}

export function monthInitial(date: ISODate): string {
  return monthName(date)[0];
}

/** "Oct 12" */
export function fmtShort(date: ISODate): string {
  const { d } = parse(date);
  return `${monthShort(date)} ${d}`;
}

/** "Oct 12, 2026" */
export function fmtLong(date: ISODate): string {
  return `${fmtShort(date)}, ${parse(date).y}`;
}

/** "Mon, Oct 12" */
export function fmtWeekday(date: ISODate): string {
  return `${WEEKDAYS[new Date(toUTC(date)).getUTCDay()]}, ${fmtShort(date)}`;
}

/** "Jan 2025" */
export function fmtMonthYear(date: ISODate): string {
  return `${monthShort(date)} ${parse(date).y}`;
}

export function isValidISO(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parse(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** "9:00 AM" from "09:00" */
export function fmtTime(hhmm: string): string {
  const [h, min] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

/** "in 25 days", "today", "tomorrow", "2 days ago" */
export function relativeDays(from: ISODate, to: ISODate): string {
  const n = diffDays(from, to);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
