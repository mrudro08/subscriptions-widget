import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emptyState, tileFor } from "./catalog";
import { todayISO } from "./dates";
import { parseState } from "./persist";
import { isTauri, loadState, saveState } from "./platform";
import { backfillCharges, pruneSent, restoredNextDate, rollForward, uid } from "./rules";
import { SAMPLE_TODAY, sampleState } from "./sample";
import type { AppState, Cycle, ISODate, PaymentMethod, Settings, Subscription } from "./types";

export interface SubInput {
  name: string;
  amount: number;
  cycle: Cycle;
  nextDate: ISODate;
  methodId: string;
  /** Add only: record past payments from this date (optional). */
  since?: ISODate;
}

interface Store {
  state: AppState;
  today: ISODate;
  now: () => Date;
  update: (fn: (s: AppState) => AppState) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addSub: (input: SubInput) => Subscription;
  editSub: (id: string, input: SubInput) => void;
  cancelSub: (id: string) => Subscription | undefined;
  restoreSub: (id: string) => void;
  undoCancel: (snapshot: Subscription) => void;
  deleteSub: (id: string) => void;
  saveMethod: (m: PaymentMethod) => void;
  deleteMethod: (id: string) => void;
  replaceAll: (s: AppState) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("store missing");
  return s;
}

const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
/** Browser preview only: `?demo` loads the Figma sample with today = Oct 10, 2026. */
export const DEMO = !isTauri && params.has("demo");

function demoNow(): Date {
  const [y, m, d] = SAMPLE_TODAY.split("-").map(Number);
  const real = new Date();
  return new Date(y, m - 1, d, real.getHours(), real.getMinutes(), real.getSeconds());
}

export function StoreProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const now = useCallback(() => (DEMO ? demoNow() : new Date()), []);
  const [today, setToday] = useState<ISODate>(() => todayISO(now()));
  const loaded = useRef(false);

  // Load once.
  useEffect(() => {
    (async () => {
      let s: AppState;
      if (DEMO) {
        s = sampleState();
        const theme = params.get("theme");
        if (theme === "dark" || theme === "light") s.settings.theme = theme;
        const size = params.get("size");
        if (size === "medium" || size === "small") s.settings.size = size;
        if (params.has("empty")) s = { ...emptyState(), settings: s.settings };
        if (params.has("chart")) s.settings.chartOpen = true;
      } else {
        const raw = await loadState().catch(() => null);
        try {
          s = raw ? parseState(raw) : emptyState();
        } catch {
          s = emptyState();
        }
      }
      const t = todayISO(now());
      s = rollForward(s, t).state;
      s = { ...s, sentReminders: pruneSent(s.sentReminders, t) };
      loaded.current = true;
      setToday(t);
      setState(s);
    })();
  }, [now]);

  // Persist (debounced). The demo never writes.
  useEffect(() => {
    if (!state || !loaded.current || DEMO) return;
    const t = setTimeout(() => void saveState(state), 250);
    return () => clearTimeout(t);
  }, [state]);

  // Clock: notice midnight (and a PC waking from sleep) within 30 s.
  useEffect(() => {
    const tick = () => setToday(todayISO(now()));
    const id = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [now]);

  // Roll renewals forward when the date changes.
  useEffect(() => {
    setState((s) => (s ? rollForward(s, today).state : s));
  }, [today]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => (s ? fn(s) : s)), []);

  const store = useMemo<Store | null>(() => {
    if (!state) return null;
    return {
      state,
      today,
      now,
      update,
      setSettings: (patch) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
      addSub: (input) => {
        const sub: Subscription = {
          id: uid("sub"),
          name: input.name.trim(),
          amount: input.amount,
          cycle: input.cycle,
          nextDate: input.nextDate,
          anchorDay: Number(input.nextDate.slice(8)),
          methodId: input.methodId,
          tile: tileFor(input.name),
          status: "active",
          createdAt: today,
        };
        const past = input.since ? backfillCharges(sub, input.since, today) : [];
        update((s) => ({ ...s, subscriptions: [...s.subscriptions, sub], charges: [...s.charges, ...past] }));
        return sub;
      },
      editSub: (id, input) =>
        update((s) => ({
          ...s,
          subscriptions: s.subscriptions.map((x) => {
            if (x.id !== id) return x;
            const name = input.name.trim();
            // Amount / method changes apply from the next renewal; history keeps what was paid.
            return {
              ...x,
              name,
              tile: name.toLowerCase() === x.name.toLowerCase() ? x.tile : tileFor(name),
              amount: input.amount,
              cycle: input.cycle,
              nextDate: input.nextDate,
              anchorDay: input.nextDate !== x.nextDate ? Number(input.nextDate.slice(8)) : x.anchorDay,
              methodId: input.methodId,
            };
          }),
        })),
      cancelSub: (id) => {
        const snap = state.subscriptions.find((x) => x.id === id);
        update((s) => ({
          ...s,
          subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, status: "cancelled", cancelledAt: today } : x)),
        }));
        return snap;
      },
      restoreSub: (id) =>
        update((s) => ({
          ...s,
          subscriptions: s.subscriptions.map((x) =>
            x.id === id ? { ...x, status: "active", cancelledAt: undefined, nextDate: restoredNextDate(x, today) } : x,
          ),
        })),
      undoCancel: (snap) =>
        update((s) => ({ ...s, subscriptions: s.subscriptions.map((x) => (x.id === snap.id ? snap : x)) })),
      deleteSub: (id) =>
        update((s) => ({
          ...s,
          subscriptions: s.subscriptions.filter((x) => x.id !== id),
          charges: s.charges.filter((c) => c.subId !== id),
          sentReminders: s.sentReminders.filter((k) => !k.startsWith(`${id}:`)),
        })),
      saveMethod: (m) =>
        update((s) => ({
          ...s,
          methods: s.methods.some((x) => x.id === m.id) ? s.methods.map((x) => (x.id === m.id ? m : x)) : [...s.methods, m],
        })),
      deleteMethod: (id) => update((s) => ({ ...s, methods: s.methods.filter((m) => m.id !== id) })),
      replaceAll: (next) => setState(rollForward({ ...next, settings: { ...next.settings, position: state.settings.position } }, today).state),
    };
  }, [state, today, now, update]);

  if (!store) return <>{fallback}</>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
