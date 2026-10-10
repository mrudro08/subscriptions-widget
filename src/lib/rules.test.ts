import { describe, expect, it } from "vitest";
import { addMonthsAnchored, fmtTime } from "./dates";
import { money, parseAmount } from "./money";
import {
  backfillCharges,
  buildToast,
  chart,
  dueReminders,
  dueTag,
  dueWindow,
  pruneSent,
  recentlyCharged,
  restoredNextDate,
  rollForward,
  subStats,
  upcoming,
  yearlyCost,
  active,
  reminderHint,
} from "./rules";
import { SAMPLE_TODAY, sampleState } from "./sample";
import type { Subscription } from "./types";

const T = SAMPLE_TODAY;
const usd = (c: number) => money(c, "USD");

describe("headline — due in the next 30 days (Figma sample)", () => {
  const w = dueWindow(sampleState(), T);
  it("totals $199.34 over 7 payments, Oct 10 – Nov 8", () => {
    expect(usd(w.total)).toBe("$199.34");
    expect(w.count).toBe(7);
    expect(w.from).toBe("2026-10-10");
    expect(w.to).toBe("2026-11-08");
  });
  it("splits by payment method, sorted by next date", () => {
    expect(w.byMethod.map((m) => [m.method.name, usd(m.total), m.count, m.next])).toEqual([
      ["Wise", "$35.49", 2, "2026-10-12"],
      ["Card ••4821", "$29.98", 3, "2026-10-14"],
      ["PayPal", "$133.87", 2, "2026-10-26"],
    ]);
  });
});

describe("yearly cost", () => {
  it("is Σ monthly × 12 + Σ yearly = $1,073.40", () => {
    expect(yearlyCost(active(sampleState()))).toBe(107340);
  });
});

describe("charged per month", () => {
  const c = chart(sampleState(), T);
  it("October = $2.99 charged + $76.47 still due = $79.46", () => {
    expect(c.current.charged).toBe(299);
    expect(c.current.stillDue).toBe(7647);
    expect(c.current.total).toBe(7946);
  });
  it("is down $14.99 on September", () => {
    expect(c.previous.total - c.current.total).toBe(1499);
  });
  it("has a 12-month average of $77.37 and a Lightroom spike in November", () => {
    expect(usd(c.average!)).toBe("$77.37");
    expect(c.bars[0].month).toBe("2025-11-01");
    expect(c.bars[0].yearly).toEqual(["Lightroom"]);
    expect(c.bars.length).toBe(12);
  });
  it("marks months before tracking began", () => {
    const s = sampleState();
    s.subscriptions = s.subscriptions.filter((x) => x.id === "s_chatgpt");
    s.charges = s.charges.filter((x) => x.subId === "s_chatgpt");
    const cc = chart(s, T);
    expect(cc.bars.filter((b) => b.tracked).length).toBe(4); // Jul–Oct
  });
});

describe("due tag", () => {
  it.each([
    ["2026-10-10", "Today", "urgent"],
    ["2026-10-11", "Tomorrow", "urgent"],
    ["2026-10-12", "In 2 days", "urgent"],
    ["2026-10-13", "In 3 days", "soon"],
    ["2026-10-17", "In 7 days", "soon"],
    ["2026-10-18", "Oct 18", "normal"],
  ])("%s → %s", (date, label, tone) => {
    expect(dueTag(date, T)).toEqual({ label, tone });
  });
});

describe("renewal roll-forward", () => {
  it("records the charge after midnight and moves Netflix Oct 12 → Nov 12", () => {
    const { state, added } = rollForward(sampleState(), "2026-10-13");
    const n = state.subscriptions.find((s) => s.id === "s_netflix")!;
    expect(n.nextDate).toBe("2026-11-12");
    expect(n.lastChargedAt).toBe("2026-10-12");
    expect(added.map((a) => a.subId)).toEqual(["s_netflix"]);
    expect(recentlyCharged(n, "2026-10-13")).toBe("2026-10-12");
    expect(recentlyCharged(n, "2026-10-15")).toBe("2026-10-12");
    expect(recentlyCharged(n, "2026-10-16")).toBeNull();
  });
  it("does not roll on the renewal day itself", () => {
    const { added } = rollForward(sampleState(), "2026-10-12");
    expect(added).toHaveLength(0);
  });
  it("catches up every missed charge after the app was closed", () => {
    const { state, added } = rollForward(sampleState(), "2027-01-13");
    expect(added.filter((a) => a.subId === "s_netflix").map((a) => a.date)).toEqual([
      "2026-10-12",
      "2026-11-12",
      "2026-12-12",
      "2027-01-12",
    ]);
    expect(state.subscriptions.find((s) => s.id === "s_netflix")!.nextDate).toBe("2027-02-12");
  });
  it("never rolls cancelled subscriptions", () => {
    const { added } = rollForward(sampleState(), "2027-01-13");
    expect(added.some((a) => a.subId === "s_disney")).toBe(false);
  });
  it("keeps the anchor day: Jan 31 → Feb 28 → Mar 31", () => {
    expect(addMonthsAnchored("2027-01-31", 1, 31)).toBe("2027-02-28");
    expect(addMonthsAnchored("2027-02-28", 1, 31)).toBe("2027-03-31");
  });
  it("moves yearly plans one year, Feb 29 → Feb 28", () => {
    expect(addMonthsAnchored("2028-02-29", 12, 29)).toBe("2029-02-28");
    expect(addMonthsAnchored("2031-02-28", 12, 29)).toBe("2032-02-29");
  });
  it("restoring skips renewals that passed while cancelled", () => {
    const d = sampleState().subscriptions.find((s) => s.id === "s_disney")!;
    expect(restoredNextDate(d, T)).toBe("2026-11-08");
  });
});

describe("Add — impact preview", () => {
  it("Notion $10 on Nov 4 via Wise → $209.34, Wise needs $45.49", () => {
    const s = sampleState();
    const notion: Subscription = {
      id: "n", name: "Notion", amount: 1000, cycle: "monthly", nextDate: "2026-11-04", anchorDay: 4,
      methodId: "m_wise", tile: "gray", status: "active", createdAt: T,
    };
    const w = dueWindow(s, T, [...active(s), notion]);
    expect(usd(w.total)).toBe("$209.34");
    expect(usd(w.byMethod.find((m) => m.method.name === "Wise")!.total)).toBe("$45.49");
  });
  it("shows the reminder date under the next payment", () => {
    expect(reminderHint(sampleState(), "2026-11-04", T, fmtTime)).toBe("Reminder Nov 3 at 9:00 AM (1 day before)");
  });
});

describe("Edit — history", () => {
  it("Netflix: tracked since Jan 2025, $185.88 over 12 charges, all via Wise", () => {
    const s = sampleState();
    const st = subStats(s, s.subscriptions[0], T);
    expect(st.since).toBe("2025-01-12");
    expect(usd(st.last12)).toBe("$185.88");
    expect(st.count12).toBe(12);
    expect(st.methods).toEqual(["Wise"]);
  });
  it("backfills past payments from 'Paying since'", () => {
    const sub = sampleState().subscriptions[0];
    const c = backfillCharges(sub, "2026-07-01", T);
    expect(c.map((x) => x.date)).toEqual(["2026-07-12", "2026-08-12", "2026-09-12"]);
  });
});

describe("lists", () => {
  it("Upcoming is sorted by what's due next", () => {
    expect(upcoming(sampleState()).map((s) => s.name)).toEqual([
      "Netflix", "Spotify", "ChatGPT Plus", "Figma Professional", "YouTube Premium", "iCloud+", "Lightroom",
    ]);
  });
});

describe("reminders", () => {
  const at = (d: string, hh: number) => new Date(`${d}T${String(hh).padStart(2, "0")}:00:00`);
  it("sends Netflix the day before at 9:00 AM", () => {
    const s = sampleState();
    expect(dueReminders(s, at("2026-10-11", 8), "2026-10-11")).toHaveLength(0);
    const [t] = dueReminders(s, at("2026-10-11", 9), "2026-10-11");
    expect(t.title).toBe("Netflix renews tomorrow");
    expect(t.body).toBe("$15.49 from Wise · Mon, Oct 12");
    expect(t.actions.map((a) => a.label)).toEqual(["Open", "Mark as cancelled"]);
  });
  it("does not repeat a reminder once sent", () => {
    const s = sampleState();
    s.sentReminders = ["s_netflix:2026-10-12"];
    expect(dueReminders(s, at("2026-10-11", 15), "2026-10-11")).toHaveLength(0);
  });
  it("merges same-day renewals into one notification", () => {
    const s = sampleState();
    const subs = s.subscriptions.filter((x) => x.id === "s_spotify" || x.id === "s_figma");
    const t = buildToast(s, subs, "2026-10-14", 1);
    expect(t.title).toBe("2 renewals tomorrow");
    expect(t.body).toBe("Figma Professional $15.00 and Spotify $11.99 · $26.99 from Card ••4821");
    expect(t.actions).toEqual([{ id: "open", label: "Open" }]);
  });
  it("respects the off switch", () => {
    const s = sampleState();
    s.settings.reminders.enabled = false;
    expect(dueReminders(s, at("2026-10-11", 10), "2026-10-11")).toHaveLength(0);
  });
  it("prunes old keys", () => {
    expect(pruneSent(["a:2026-09-01", "b:2026-10-09"], T)).toEqual(["b:2026-10-09"]);
  });
});

describe("money input", () => {
  it.each([
    ["10", 1000],
    ["10.5", 1050],
    ["1,299.00", 129900],
    ["0", null],
    ["abc", null],
    ["1.234", null],
  ])("%s → %s", (input, cents) => expect(parseAmount(input)).toBe(cents));
});
