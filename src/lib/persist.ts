import { DEFAULT_SETTINGS, emptyState } from "./catalog";
import { isValidISO } from "./dates";
import type { AppState, Charge, PaymentMethod, Settings, Subscription } from "./types";

const TILES = new Set(["red", "green", "slate", "violet", "orange", "blue", "teal", "gray"]);
const COLORS = new Set(["teal", "violet", "blue", "gray", "orange", "green", "red"]);

function str(v: unknown, max = 80): string | null {
  return typeof v === "string" && v.trim() && v.length <= max ? v : null;
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1e9 ? v : null;
}
function date(v: unknown): string | null {
  return typeof v === "string" && isValidISO(v) ? v : null;
}

/** Reads saved data or a backup file. Throws a readable message if it isn't one. */
export function parseState(json: string): AppState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("That file isn't a Subscriptions backup.");
  }
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as AppState).subscriptions)) {
    throw new Error("That file isn't a Subscriptions backup.");
  }
  const r = raw as Partial<AppState>;
  const base = emptyState();

  const methods: PaymentMethod[] = (Array.isArray(r.methods) ? r.methods : [])
    .map((m) => {
      const id = str(m?.id), name = str(m?.name, 40);
      if (!id || !name) return null;
      return { id, name, color: COLORS.has(m.color) ? m.color : "gray" } as PaymentMethod;
    })
    .filter((m): m is PaymentMethod => !!m);

  const subscriptions: Subscription[] = (r.subscriptions ?? [])
    .map((s) => {
      const id = str(s?.id), name = str(s?.name), amount = int(s?.amount), nextDate = date(s?.nextDate);
      if (!id || !name || !amount || !nextDate) return null;
      const anchorDay = Number.isInteger(s.anchorDay) && s.anchorDay >= 1 && s.anchorDay <= 31 ? s.anchorDay : Number(nextDate.slice(8));
      return {
        id,
        name,
        amount,
        cycle: s.cycle === "yearly" ? "yearly" : "monthly",
        nextDate,
        anchorDay,
        methodId: str(s.methodId) ?? "",
        tile: TILES.has(s.tile) ? s.tile : "gray",
        status: s.status === "cancelled" ? "cancelled" : "active",
        createdAt: date(s.createdAt) ?? nextDate,
        cancelledAt: date(s.cancelledAt) ?? undefined,
        lastChargedAt: date(s.lastChargedAt) ?? undefined,
      } as Subscription;
    })
    .filter((s): s is Subscription => !!s);

  const subIds = new Set(subscriptions.map((s) => s.id));
  const charges: Charge[] = (Array.isArray(r.charges) ? r.charges : [])
    .map((c) => {
      const id = str(c?.id), subId = str(c?.subId), d = date(c?.date), amount = int(c?.amount);
      if (!id || !subId || !d || !amount || !subIds.has(subId)) return null;
      return { id, subId, date: d, amount, methodId: str(c.methodId) ?? "" };
    })
    .filter((c): c is Charge => !!c);

  const s = (r.settings ?? {}) as Partial<Settings>;
  const rem: Partial<Settings["reminders"]> = s.reminders ?? {};
  const settings: Settings = {
    theme: s.theme === "light" || s.theme === "dark" ? s.theme : "system",
    size: s.size === "medium" || s.size === "small" ? s.size : "full",
    keepOnTop: !!s.keepOnTop,
    launchAtStartup: s.launchAtStartup ?? DEFAULT_SETTINGS.launchAtStartup,
    currency: typeof s.currency === "string" && /^[A-Z]{3}$/.test(s.currency) ? s.currency : "USD",
    reminders: {
      enabled: rem.enabled ?? true,
      lead: rem.lead === 0 || rem.lead === 3 ? rem.lead : 1,
      time: typeof rem.time === "string" && /^\d{2}:\d{2}$/.test(rem.time) ? rem.time : "09:00",
    },
    chartOpen: !!s.chartOpen,
    position:
      s.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y) ? { x: s.position.x, y: s.position.y } : undefined,
    seenHideHint: !!s.seenHideHint,
  };

  return {
    version: 1,
    subscriptions,
    charges,
    methods: methods.length || subscriptions.length ? methods : base.methods,
    settings,
    sentReminders: Array.isArray(r.sentReminders) ? r.sentReminders.filter((k) => typeof k === "string").slice(-500) : [],
  };
}

/** Backups carry data and preferences, but not this PC's window position. */
export function backupJSON(state: AppState): string {
  const { position: _p, ...settings } = state.settings;
  void _p;
  return JSON.stringify({ ...state, settings, exportedAt: new Date().toISOString() }, null, 2);
}
