// Thin bridge to the native shell. In a plain browser (the design preview and
// screenshot tests) everything falls back to harmless local stand-ins.

import type { AppState } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Unlisten = () => void;

async function core() {
  return import("@tauri-apps/api/core");
}
async function win() {
  const m = await import("@tauri-apps/api/window");
  return { mod: m, w: m.getCurrentWindow() };
}

// ───────── persistence ─────────

const LS_KEY = "subscriptions-preview-state";

export async function loadState(): Promise<string | null> {
  if (isTauri) return (await core()).invoke<string | null>("load_state");
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export async function saveState(state: AppState): Promise<void> {
  const json = JSON.stringify(state);
  if (isTauri) return (await core()).invoke("save_state", { json });
  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    /* preview only */
  }
}

// ───────── notifications ─────────

export interface ToastPayload {
  tag: string;
  title: string;
  body: string;
  actions: { id: string; label: string }[];
}

export const previewToasts: ToastPayload[] = [];

export async function notify(args: ToastPayload): Promise<void> {
  if (isTauri) {
    await (await core()).invoke("notify", { args });
    return;
  }
  previewToasts.push(args);
  console.info("[notification]", args.title, "—", args.body);
}

export async function onToastActivated(cb: (tag: string, action: string) => void): Promise<Unlisten> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<{ tag: string; action: string }>("toast-activated", (e) => cb(e.payload.tag, e.payload.action));
}

export async function onTrayAction(cb: (action: string) => void): Promise<Unlisten> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("tray-action", (e) => cb(e.payload));
}

// ───────── window ─────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Work area (screen minus taskbar) of the monitor the widget is on, in logical px. */
export async function workArea(): Promise<Rect> {
  if (!isTauri) return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  const { mod } = await win();
  const mon = (await mod.currentMonitor()) ?? (await mod.primaryMonitor());
  if (!mon) return { x: 0, y: 0, w: 1280, h: 720 };
  const s = mon.scaleFactor;
  const wa = mon.workArea;
  return { x: wa.position.x / s, y: wa.position.y / s, w: wa.size.width / s, h: wa.size.height / s };
}

export async function allWorkAreas(): Promise<Rect[]> {
  if (!isTauri) return [await workArea()];
  const { mod } = await win();
  const mons = await mod.availableMonitors();
  return mons.map((m) => {
    const s = m.scaleFactor;
    return {
      x: m.workArea.position.x / s,
      y: m.workArea.position.y / s,
      w: m.workArea.size.width / s,
      h: m.workArea.size.height / s,
    };
  });
}

/** Moves and resizes the window in one go (logical px). */
export async function placeWindow(r: Rect): Promise<void> {
  if (!isTauri) return;
  const { mod, w } = await win();
  void mod;
  const { LogicalPosition, LogicalSize } = await import("@tauri-apps/api/dpi");
  await Promise.all([
    w.setPosition(new LogicalPosition(Math.round(r.x), Math.round(r.y))),
    w.setSize(new LogicalSize(Math.ceil(r.w), Math.ceil(r.h))),
  ]);
}

export async function windowPosition(): Promise<{ x: number; y: number } | null> {
  if (!isTauri) return null;
  const { w } = await win();
  const p = await w.outerPosition();
  const s = await w.scaleFactor();
  return { x: p.x / s, y: p.y / s };
}

export async function onWindowMoved(cb: () => void): Promise<Unlisten> {
  if (!isTauri) return () => {};
  const { w } = await win();
  return w.onMoved(() => cb());
}

export async function onWindowFocus(cb: (focused: boolean) => void): Promise<Unlisten> {
  if (!isTauri) {
    const f = () => cb(true);
    const b = () => cb(false);
    window.addEventListener("focus", f);
    window.addEventListener("blur", b);
    return () => {
      window.removeEventListener("focus", f);
      window.removeEventListener("blur", b);
    };
  }
  const { w } = await win();
  return w.onFocusChanged((e) => cb(e.payload));
}

export async function startDrag(): Promise<void> {
  if (!isTauri) return;
  const { w } = await win();
  await w.startDragging();
}

export async function showWindow(): Promise<void> {
  if (!isTauri) return;
  const { w } = await win();
  await w.show();
  await w.setFocus();
}

export async function hideWindow(): Promise<void> {
  if (!isTauri) return;
  const { w } = await win();
  await w.hide();
}

export async function setAlwaysOnTop(on: boolean): Promise<void> {
  if (!isTauri) return;
  const { w } = await win();
  await w.setAlwaysOnTop(on);
}

export async function quitApp(): Promise<void> {
  if (!isTauri) return;
  await (await core()).invoke("quit_app");
}

// ───────── launch at startup ─────────

export async function setAutostart(on: boolean): Promise<void> {
  if (!isTauri) return;
  const a = await import("@tauri-apps/plugin-autostart");
  const enabled = await a.isEnabled();
  if (on && !enabled) await a.enable();
  if (!on && enabled) await a.disable();
}

// ───────── backup files ─────────

export async function exportBackup(json: string, suggested: string): Promise<boolean> {
  if (!isTauri) {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = suggested;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: suggested, filters: [{ name: "Subscriptions backup", extensions: ["json"] }] });
  if (!path) return false;
  await (await core()).invoke("write_text_file", { path, contents: json });
  return true;
}

export async function pickBackup(): Promise<string | null> {
  if (!isTauri) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        f.text().then(resolve, () => resolve(null));
      };
      input.click();
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, filters: [{ name: "Subscriptions backup", extensions: ["json"] }] });
  if (!path || Array.isArray(path)) return null;
  return (await core()).invoke<string>("read_text_file", { path });
}
