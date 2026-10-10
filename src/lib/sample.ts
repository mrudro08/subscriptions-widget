// The Figma sample (today = Sat, Oct 10, 2026). Used by the tests and by the
// browser preview (`?demo`). Never loaded in the installed app.
import { emptyState } from "./catalog";
import { addMonthsAnchored } from "./dates";
import type { AppState, Charge, Cycle, ISODate, Subscription, Tile } from "./types";

export const SAMPLE_TODAY = "2026-10-10";

interface Spec {
  id: string;
  name: string;
  amount: number;
  cycle: Cycle;
  first: ISODate; // first charge
  next: ISODate;
  method: string;
  tile: Tile;
  cancelledAt?: ISODate;
}

const SPECS: Spec[] = [
  { id: "s_netflix", name: "Netflix", amount: 1549, cycle: "monthly", first: "2025-01-12", next: "2026-10-12", method: "m_wise", tile: "red" },
  { id: "s_spotify", name: "Spotify", amount: 1199, cycle: "monthly", first: "2025-01-14", next: "2026-10-14", method: "m_card", tile: "green" },
  { id: "s_chatgpt", name: "ChatGPT Plus", amount: 2000, cycle: "monthly", first: "2026-07-18", next: "2026-10-18", method: "m_wise", tile: "slate" },
  { id: "s_figma", name: "Figma Professional", amount: 1500, cycle: "monthly", first: "2025-01-21", next: "2026-10-21", method: "m_card", tile: "violet" },
  { id: "s_youtube", name: "YouTube Premium", amount: 1399, cycle: "monthly", first: "2025-01-26", next: "2026-10-26", method: "m_paypal", tile: "orange" },
  { id: "s_icloud", name: "iCloud+", amount: 299, cycle: "monthly", first: "2025-01-02", next: "2026-11-02", method: "m_card", tile: "blue" },
  { id: "s_lightroom", name: "Lightroom", amount: 11988, cycle: "yearly", first: "2025-11-05", next: "2026-11-05", method: "m_paypal", tile: "teal" },
  { id: "s_disney", name: "Disney+", amount: 1499, cycle: "monthly", first: "2026-09-08", next: "2026-10-08", method: "m_paypal", tile: "blue", cancelledAt: "2026-09-30" },
];

export function sampleState(): AppState {
  const base = emptyState();
  base.methods = [
    { id: "m_wise", name: "Wise", color: "teal" },
    { id: "m_card", name: "Card ••4821", color: "violet" },
    { id: "m_paypal", name: "PayPal", color: "blue" },
    { id: "m_bank", name: "Bank transfer", color: "gray" },
  ];
  const subs: Subscription[] = [];
  const charges: Charge[] = [];
  for (const s of SPECS) {
    const anchorDay = Number(s.first.slice(8));
    const created = s.id === "s_lightroom" ? "2025-01-05" : s.first;
    subs.push({
      id: s.id,
      name: s.name,
      amount: s.amount,
      cycle: s.cycle,
      nextDate: s.next,
      anchorDay,
      methodId: s.method,
      tile: s.tile,
      status: s.cancelledAt ? "cancelled" : "active",
      createdAt: created,
      cancelledAt: s.cancelledAt,
    });
    let d = s.first;
    let i = 0;
    while (d < s.next && i < 500) {
      charges.push({ id: `c_${s.id}_${i++}`, subId: s.id, date: d, amount: s.amount, methodId: s.method });
      d = addMonthsAnchored(d, s.cycle === "monthly" ? 1 : 12, anchorDay);
    }
  }
  base.subscriptions = subs;
  base.charges = charges;
  return base;
}
