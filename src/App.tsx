import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent } from "react";
import { ChartCard } from "./components/ChartCard";
import { MediumWidget, SmallWidget } from "./components/Compact";
import { CircleCheck, CreditCard, Ellipsis, Plus, STROKE } from "./components/icons";
import { ROW_MENU_H, ROW_MENU_W, RowMenu, WIDGET_MENU_H, WIDGET_MENU_W, WidgetMenu } from "./components/Menus";
import { SettingsView } from "./components/SettingsView";
import { SubForm } from "./components/SubForm";
import { SubList, type Confirm } from "./components/SubList";
import { Summary } from "./components/Summary";
import { ThemeToggle } from "./components/ui";
import { POPULAR } from "./lib/catalog";
import { fmtShort } from "./lib/dates";
import { money } from "./lib/money";
import {
  allWorkAreas,
  hideWindow,
  isTauri,
  notify,
  onToastActivated,
  onTrayAction,
  onWindowFocus,
  onWindowMoved,
  placeWindow,
  quitApp,
  setAlwaysOnTop,
  setAutostart,
  showWindow,
  startDrag,
  windowPosition,
  workArea,
  type Rect,
} from "./lib/platform";
import { active, cancelled, chart as buildChart, dueReminders, dueWindow, occurrences, upcoming, yearlyCost, yearlyOf } from "./lib/rules";
import { DEMO, useStore } from "./lib/store";
import type { Subscription } from "./lib/types";

type View = { kind: "main" } | { kind: "add"; prefill?: string } | { kind: "edit"; id: string } | { kind: "settings" };
type Menu =
  | null
  | { kind: "widget"; style: CSSProperties; outside: boolean }
  | { kind: "row"; id: string; style: CSSProperties };
interface Toast {
  id: number;
  msg: string;
  undo?: () => void;
}

const MAX_FULL = 720;
// Transparent margin around the widget so its drop shadow isn't clipped.
const M_TOP = 12;
const M_X = 28;
const M_BOTTOM = 44;
const FULL_W = 360;
const COMPACT = { medium: { w: 360, h: 170 }, small: { w: 170, h: 170 } } as const;
const DRAG_BLOCK = "button, input, select, textarea, a, [role=menuitem], [role=listitem], .chart__head, .popover, .tabs, .confirm, .method-editor, .input, .picks, .seg, .list";

export default function App() {
  const store = useStore();
  const { state, today, setSettings } = store;
  const s = state.settings;

  // ───────── theme ─────────
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const f = () => setSystemDark(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const dark = s.theme === "dark" || (s.theme === "system" && systemDark);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  // ───────── ui state ─────────
  const [view, setView] = useState<View>({ kind: "main" });
  const [tab, setTab] = useState<"upcoming" | "cancelled">("upcoming");
  const [menu, setMenu] = useState<Menu>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flyout, setFlyout] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const compact = s.size !== "full" && !flyout;
  const layout: "full" | "medium" | "small" = compact ? (s.size as "medium" | "small") : "full";

  const showToast = useCallback((msg: string, undo?: () => void) => {
    setToast({ id: Date.now(), msg, undo });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1800);
    return () => clearTimeout(t);
  }, [flashId]);

  // ───────── derived numbers ─────────
  const due = useMemo(() => dueWindow(state, today), [state, today]);
  const yearly = useMemo(() => yearlyCost(active(state)), [state]);
  const chartData = useMemo(() => buildChart(state, today), [state, today]);
  const upList = useMemo(() => upcoming(state), [state]);
  const cancelledList = useMemo(() => cancelled(state), [state]);
  const cur = s.currency;

  // ───────── screen + window placement ─────────
  const [wa, setWa] = useState<Rect>({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [offset, setOffset] = useState({ ox: 0, oy: 0 });
  const [fullH, setFullH] = useState(MAX_FULL);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const lastPlaced = useRef(0);
  const shown = useRef(false);
  const lastWin = useRef<string>("");
  const originRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [relayout, setRelayout] = useState(0);
  const maxH = Math.max(320, Math.min(MAX_FULL, wa.h - 48));

  // Initial placement: last position if it's still on a screen, else the top-right corner.
  useEffect(() => {
    (async () => {
      const area = await workArea();
      setWa(area);
      if (!isTauri) {
        setAnchor({ x: 40, y: 32 });
        return;
      }
      const areas = await allWorkAreas();
      const p = s.position;
      const onScreen = p && areas.some((a) => p.x >= a.x - 40 && p.y >= a.y - 10 && p.x < a.x + a.w - 60 && p.y < a.y + a.h - 60);
      setAnchor(onScreen ? p! : { x: area.x + area.w - FULL_W - 24, y: area.y + 24 });
      void setAlwaysOnTop(s.keepOnTop);
      void setAutostart(s.launchAtStartup);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where the visible widget sits relative to the anchor (non-zero only for the flyout).
  const widgetPos = useMemo(() => {
    if (!anchor || !flyout || s.size === "full") return { x: 0, y: 0 };
    const c = COMPACT[s.size];
    const rightHalf = anchor.x + c.w / 2 > wa.x + wa.w / 2;
    const x = rightHalf ? c.w - FULL_W : 0;
    const bottom = wa.y + wa.h - 12;
    const y = anchor.y + fullH > bottom ? bottom - fullH - anchor.y : 0;
    return { x, y };
  }, [anchor, flyout, s.size, wa, fullH]);

  // Fit the transparent window around the widget and any open popover.
  useLayoutEffect(() => {
    const origin = originRef.current;
    if (!origin || !anchor) return;
    const o = origin.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    origin.querySelectorAll<HTMLElement>("[data-fit]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      minX = Math.min(minX, r.left - o.left);
      minY = Math.min(minY, r.top - o.top);
      maxX = Math.max(maxX, r.right - o.left);
      maxY = Math.max(maxY, r.bottom - o.top);
    });
    if (!Number.isFinite(minX)) return;
    if (widgetRef.current && layout === "full") setFullH(widgetRef.current.offsetHeight);

    if (!isTauri) {
      setOffset((p) => (p.ox === anchor.x && p.oy === anchor.y ? p : { ox: anchor.x, oy: anchor.y }));
      return;
    }
    // Keep the widget itself on screen (e.g. after switching Medium → Full near the bottom edge).
    if (!flyout) {
      const w = widgetRef.current;
      if (w) {
        const right = anchor.x + w.offsetWidth, bottom = anchor.y + w.offsetHeight;
        const nx = Math.max(wa.x, Math.min(anchor.x, anchor.x - Math.max(0, right - (wa.x + wa.w))));
        const ny = Math.max(wa.y, Math.min(anchor.y, anchor.y - Math.max(0, bottom - (wa.y + wa.h))));
        if (Math.abs(nx - anchor.x) > 1 || Math.abs(ny - anchor.y) > 1) {
          setAnchor({ x: nx, y: ny });
          return;
        }
      }
    }
    const next = { ox: Math.round(-minX + M_X), oy: Math.round(-minY + M_TOP) };
    if (next.ox !== offsetRef.current.ox || next.oy !== offsetRef.current.oy) setOffset(next);
    const win = {
      x: anchor.x - next.ox,
      y: anchor.y - next.oy,
      w: maxX - minX + M_X * 2,
      h: maxY - minY + M_TOP + M_BOTTOM,
    };
    const key = `${Math.round(win.x)},${Math.round(win.y)},${Math.ceil(win.w)},${Math.ceil(win.h)}`;
    if (key !== lastWin.current) {
      lastWin.current = key;
      lastPlaced.current = Date.now();
      void placeWindow(win).then(() => {
        if (!shown.current) {
          shown.current = true;
          void showWindow();
        }
      });
    }
  });

  // Content that changes size on its own (fonts, scroll areas) triggers a refit.
  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRelayout((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, view.kind]);
  void relayout;

  // Dragging the window: remember where the widget was put.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let un: (() => void) | undefined;
    onWindowMoved(() => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (Date.now() - lastPlaced.current < 600) return;
        const pos = await windowPosition();
        if (!pos) return;
        const a = { x: Math.round(pos.x + offsetRef.current.ox), y: Math.round(pos.y + offsetRef.current.oy) };
        setWa(await workArea());
        setAnchor((prev) => {
          if (flyoutRef.current) return prev; // the flyout follows its compact widget
          if (prev && Math.abs(prev.x - a.x) <= 1 && Math.abs(prev.y - a.y) <= 1) return prev;
          lastWin.current = "";
          return a;
        });
      }, 250);
    }).then((u) => (un = u));
    return () => {
      clearTimeout(timer);
      un?.();
    };
  }, []);
  const flyoutRef = useRef(flyout);
  flyoutRef.current = flyout;
  useEffect(() => {
    if (anchor && !flyout && isTauri && (anchor.x !== s.position?.x || anchor.y !== s.position?.y)) setSettings({ position: anchor });
  }, [anchor, flyout, s.position, setSettings]);

  // Losing focus closes menus and the compact flyout (unless a form is open).
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    let un: (() => void) | undefined;
    onWindowFocus((focused) => {
      if (focused) return;
      setMenu(null);
      if (viewRef.current.kind === "main") setFlyout(false);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);

  const startPress = (e: RMouseEvent, onClick?: () => void) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(DRAG_BLOCK)) return;
    const sx = e.clientX, sy = e.clientY;
    let dragging = false;
    const move = (ev: MouseEvent) => {
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 3) {
        dragging = true;
        cleanup();
        if (!flyoutRef.current) void startDrag();
      }
    };
    const up = () => {
      cleanup();
      if (!dragging) onClick?.();
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ───────── actions ─────────
  const openFull = useCallback(() => {
    if (s.size !== "full") setFlyout(true);
  }, [s.size]);
  const openAdd = useCallback(
    (prefill?: string) => {
      openFull();
      setMenu(null);
      setConfirm(null);
      setView({ kind: "add", prefill });
    },
    [openFull],
  );
  const openSettings = useCallback(() => {
    openFull();
    setMenu(null);
    setView({ kind: "settings" });
  }, [openFull]);
  const backToMain = () => {
    setView({ kind: "main" });
    setConfirm(null);
  };

  const hide = useCallback(async () => {
    setMenu(null);
    setFlyout(false);
    await hideWindow();
    if (!s.seenHideHint && isTauri) {
      void notify({
        tag: "hint",
        title: "Subscriptions is still running",
        body: "Press Ctrl+Alt+S or click the tray icon to bring it back. Reminders keep working.",
        actions: [],
      });
      setSettings({ seenHideHint: true });
    }
  }, [s.seenHideHint, setSettings]);

  const doCancel = (id: string) => {
    const snap = store.cancelSub(id);
    setConfirm(null);
    if (snap) {
      showToast(`${snap.name} cancelled · saving ${money(yearlyOf(snap), cur)}/yr`, () => store.undoCancel(snap));
    }
  };
  const doDelete = (sub: Subscription) => {
    store.deleteSub(sub.id);
    setConfirm(null);
    setView({ kind: "main" });
    showToast(`${sub.name} deleted`);
  };
  const doRestore = (id: string) => {
    const sub = state.subscriptions.find((x) => x.id === id);
    store.restoreSub(id);
    if (sub) showToast(`${sub.name} restored`);
  };

  // Row menu: below the row (or above it near the bottom), right-aligned; right-click opens at the cursor.
  const openRowMenu = (id: string, at: { x: number; y: number } | null, row: HTMLElement) => {
    const w = widgetRef.current;
    if (!w) return;
    const wr = w.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    let top = (at ? at.y : rr.bottom) - wr.top + 4;
    if (top + ROW_MENU_H > wr.height - 8) top = (at ? at.y : rr.top) - wr.top - ROW_MENU_H - 4;
    const left = at
      ? Math.max(8, Math.min(at.x - wr.left, wr.width - ROW_MENU_W - 8))
      : Math.max(8, rr.right - wr.left - ROW_MENU_W);
    setConfirm(null);
    setMenu({ kind: "row", id, style: { top: Math.max(8, top), left } });
  };

  const openWidgetMenu = (at?: { x: number; y: number }) => {
    if (compact) {
      // Outside the compact widget; flips left/up when the screen edge is close.
      const c = COMPACT[s.size as "medium" | "small"];
      const a = anchor ?? { x: 0, y: 0 };
      let left = c.w - 8 - WIDGET_MENU_W;
      if (a.x + left < wa.x + 4) left = 0;
      if (a.x + left + WIDGET_MENU_W > wa.x + wa.w - 4) left = c.w - WIDGET_MENU_W;
      let top = 40;
      if (a.y + top + WIDGET_MENU_H > wa.y + wa.h - 8) top = -WIDGET_MENU_H - 6;
      setMenu({ kind: "widget", outside: true, style: { left, top } });
      return;
    }
    const w = widgetRef.current;
    if (at && w) {
      const wr = w.getBoundingClientRect();
      const left = Math.max(8, Math.min(at.x - wr.left, wr.width - WIDGET_MENU_W - 8));
      let top = at.y - wr.top + 2;
      if (top + WIDGET_MENU_H > wr.height - 8) top = Math.max(8, at.y - wr.top - WIDGET_MENU_H);
      setMenu({ kind: "widget", outside: false, style: { left, top } });
    } else {
      setMenu({ kind: "widget", outside: false, style: { right: 20, top: 59 } });
    }
  };

  // ───────── notifications ─────────
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const check = () => {
      const st = stateRef.current;
      const toasts = dueReminders(st, store.now(), today);
      if (!toasts.length) return;
      toasts.forEach((t) => void notify({ tag: t.tag, title: t.title, body: t.body, actions: t.actions }));
      const keys = toasts.flatMap((t) => t.key);
      store.update((x) => ({ ...x, sentReminders: [...x.sentReminders, ...keys] }));
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, s.reminders.enabled, s.reminders.lead, s.reminders.time]);

  useEffect(() => {
    let un1: (() => void) | undefined, un2: (() => void) | undefined;
    onToastActivated((tag, action) => {
      if (tag === "hint" || tag === "test") return;
      const st = stateRef.current;
      let id: string | undefined;
      if (tag.startsWith("sub:")) id = tag.slice(4);
      else if (tag.startsWith("group:")) {
        const d = tag.slice(6);
        id = active(st).find((x) => occurrences(x, d, d).length)?.id;
      }
      if (st.settings.size !== "full") setFlyout(true);
      setView({ kind: "main" });
      setTab("upcoming");
      setMenu(null);
      if (id && st.subscriptions.some((x) => x.id === id && x.status === "active")) {
        if (action === "cancel") setConfirm({ kind: "cancel", id });
        else setFlashId(id);
      }
    }).then((u) => (un1 = u));
    onTrayAction((a) => {
      if (a === "add") openAdd();
      if (a === "settings") openSettings();
    }).then((u) => (un2 = u));
    return () => {
      un1?.();
      un2?.();
    };
  }, [openAdd, openSettings]);

  // ───────── keyboard ─────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Turn off browser shortcuts that make no sense in a widget (reload, print, find…).
      if (e.key === "F5" || e.key === "F3" || e.key === "F7" || (e.ctrlKey && ["r", "p", "f", "g", "u", "s", "j", "h", "o"].includes(k)) || (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight"))) {
        e.preventDefault();
      }
      if (e.ctrlKey && !e.altKey && k === "n") {
        e.preventDefault();
        openAdd();
      } else if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        openSettings();
      } else if (e.key === "Escape") {
        if (menu) return;
        if (confirm) setConfirm(null);
        else if (view.kind !== "main") setView({ kind: "main" });
        else if (flyout) setFlyout(false);
      }
    };
    const onCtx = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("input")) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onCtx);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onCtx);
    };
  }, [openAdd, openSettings, menu, confirm, view.kind, flyout]);

  // ───────── render ─────────
  const editing = view.kind === "edit" ? state.subscriptions.find((x) => x.id === view.id) : undefined;
  const nothingYet = state.subscriptions.length === 0;
  const listItems = tab === "upcoming" ? upList : cancelledList;
  const menuSub = menu?.kind === "row" ? state.subscriptions.find((x) => x.id === menu.id) : undefined;

  const widgetMenu = menu?.kind === "widget" && (
    <WidgetMenu
      style={menu.style}
      size={s.size}
      keepOnTop={s.keepOnTop}
      onClose={() => setMenu(null)}
      onSize={(size) => {
        setSettings({ size });
        setFlyout(false);
        setMenu(null);
        lastWin.current = "";
      }}
      onSettings={openSettings}
      onKeepOnTop={(v) => {
        setSettings({ keepOnTop: v });
        void setAlwaysOnTop(v);
      }}
      onHide={hide}
      onQuit={() => void quitApp()}
    />
  );

  const header = (
    <div className="header">
      <div className="header__title">
        <div className="app-icon">
          <CreditCard size={16} strokeWidth={STROKE} />
        </div>
        <span className="t-title16">Subscriptions</span>
      </div>
      <div className="header__actions">
        <ThemeToggle dark={dark} onChange={(d) => setSettings({ theme: d ? "dark" : "light" })} />
        <button type="button" className="icon-btn icon-btn--solid" aria-label="Add subscription" title="Add subscription (Ctrl+N)" onClick={() => openAdd()}>
          <Plus size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--outline"
          aria-label="Widget menu"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === "widget"}
          onClick={(e) => {
            e.stopPropagation();
            if (menu?.kind === "widget") setMenu(null);
            else openWidgetMenu();
          }}
        >
          <Ellipsis size={16} strokeWidth={STROKE} />
        </button>
      </div>
    </div>
  );

  let content: React.ReactNode;
  if (layout !== "full") {
    const common = {
      state,
      today,
      upcoming: upList,
      due,
      style: { left: 0, top: 0 } as CSSProperties,
      menuOpen: menu?.kind === "widget",
      onMenu: () => (menu ? setMenu(null) : openWidgetMenu()),
      onMouseDown: (e: RMouseEvent) => startPress(e, () => (nothingYet ? openAdd() : setFlyout(true))),
      onContextMenu: (e: RMouseEvent) => {
        e.preventDefault();
        openWidgetMenu();
      },
    };
    content = (
      <>
        {layout === "medium" ? <MediumWidget ref={widgetRef} {...common} /> : <SmallWidget ref={widgetRef} {...common} />}
        {menu?.kind === "widget" && widgetMenu}
      </>
    );
  } else {
    const isForm = view.kind === "add" || (view.kind === "edit" && editing);
    content = (
      <div
        ref={widgetRef}
        className={`widget widget--full${view.kind !== "main" ? " widget--form" : ""}`}
        style={{ left: widgetPos.x, top: widgetPos.y, maxHeight: maxH }}
        data-fit
        onMouseDown={(e) => startPress(e)}
        onContextMenu={(e) => {
          if (view.kind !== "main" || (e.target as HTMLElement).closest(DRAG_BLOCK)) return;
          e.preventDefault();
          openWidgetMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {isForm ? (
          <SubForm
            key={view.kind === "edit" ? view.id : `add-${view.kind === "add" ? view.prefill ?? "" : ""}`}
            sub={editing}
            prefillName={view.kind === "add" ? view.prefill : undefined}
            onClose={backToMain}
            onAdded={(sub) => {
              setView({ kind: "main" });
              setTab("upcoming");
              setFlashId(sub.id);
              showToast(`${sub.name} added · next payment ${fmtShort(sub.nextDate)}`);
            }}
            onDeleted={doDelete}
          />
        ) : view.kind === "settings" ? (
          <SettingsView onBack={backToMain} onToast={(m) => showToast(m)} />
        ) : nothingYet ? (
          <>
            {header}
            <div className="empty">
              <div className="ghost-bars" aria-hidden>
                {[24, 34, 28, 44, 30, 38, 52].map((h, i) => (
                  <span key={i} style={{ height: h }} />
                ))}
              </div>
              <span className="t-title16">No subscriptions yet</span>
              <span className="t-body13 c-secondary" style={{ width: 270 }}>
                Add what you pay for: the name, amount and next payment date. They’ll be sorted by what’s due next.
              </span>
              <div style={{ padding: "4px 0 12px" }}>
                <button type="button" className="btn btn--primary btn--auto" onClick={() => openAdd()}>
                  <Plus size={18} strokeWidth={2} />
                  Add your first subscription
                </button>
              </div>
            </div>
            <div className="group">
              <span className="t-cap12m c-secondary">Popular</span>
              <div className="picks">
                {POPULAR.slice(0, 5).map((p) => (
                  <button key={p} type="button" className="pick--outline t-cap12m" onClick={() => openAdd(p)}>
                    <Plus size={12} strokeWidth={2} />
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {widgetMenu}
          </>
        ) : (
          <>
            {header}
            <Summary due={due} yearly={yearly} currency={cur} />
            <ChartCard chart={chartData} open={s.chartOpen} currency={cur} onToggle={() => setSettings({ chartOpen: !s.chartOpen })} />
            <div className="list-header">
              <div className="tabs" role="tablist">
                {(["upcoming", "cancelled"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    className="tab"
                    onClick={() => {
                      setTab(t);
                      setConfirm(null);
                    }}
                  >
                    <span className="t-body13m">{t === "upcoming" ? "Upcoming" : "Cancelled"}</span>
                    <span className="t-cap12 tab__count">{t === "upcoming" ? upList.length : cancelledList.length}</span>
                  </button>
                ))}
              </div>
              <span className="t-cap12 c-tertiary">{tab === "upcoming" ? "Due first" : "Latest first"}</span>
            </div>
            <SubList
              items={listItems}
              tab={tab}
              state={state}
              today={today}
              confirm={confirm}
              menuId={menu?.kind === "row" ? menu.id : null}
              flashId={flashId}
              toastOpen={!!toast}
              onEdit={(id) => {
                setMenu(null);
                setView({ kind: "edit", id });
              }}
              onMenu={openRowMenu}
              onAskDelete={(id) => {
                setMenu(null);
                setConfirm({ kind: "delete", id });
              }}
              onRestore={doRestore}
              onDismissConfirm={() => setConfirm(null)}
              onConfirm={() => {
                if (!confirm) return;
                const sub = state.subscriptions.find((x) => x.id === confirm.id);
                if (!sub) return setConfirm(null);
                if (confirm.kind === "cancel") doCancel(sub.id);
                else doDelete(sub);
              }}
            />
            {widgetMenu}
            {menuSub && menu?.kind === "row" && (
              <RowMenu
                sub={menuSub}
                style={menu.style}
                onClose={() => setMenu(null)}
                onEdit={() => {
                  setMenu(null);
                  setView({ kind: "edit", id: menuSub.id });
                }}
                onCancel={() => {
                  setMenu(null);
                  setConfirm({ kind: "cancel", id: menuSub.id });
                }}
                onRestore={() => {
                  setMenu(null);
                  doRestore(menuSub.id);
                }}
                onDelete={() => {
                  setMenu(null);
                  setConfirm({ kind: "delete", id: menuSub.id });
                }}
              />
            )}
          </>
        )}
        {toast && (
          <div className="toast" role="status" key={toast.id}>
            <span className="toast__msg">
              <CircleCheck size={16} strokeWidth={STROKE} />
              <span className="t-cap12m ellipsis">{toast.msg}</span>
            </span>
            {toast.undo && (
              <button
                type="button"
                className="toast__action t-cap12m"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`stage${isTauri ? "" : " preview"}`}>
      <div
        ref={originRef}
        className="stage__origin"
        style={{ "--ox": `${offset.ox}px`, "--oy": `${offset.oy}px` } as CSSProperties}
      >
        {anchor && content}
      </div>
      {DEMO && <span className="sr-only">demo</span>}
    </div>
  );
}
