import { useState } from "react";
import { CURRENCIES } from "../lib/money";
import { fmtTime } from "../lib/dates";
import { backupJSON, parseState } from "../lib/persist";
import { exportBackup, notify, pickBackup, setAlwaysOnTop, setAutostart } from "../lib/platform";
import { buildToast, upcoming } from "../lib/rules";
import { useStore } from "../lib/store";
import type { AppState, LeadDays, PaymentMethod, ThemePref, WidgetSize } from "../lib/types";
import {
  ArrowLeft,
  Bell,
  Check,
  Clock,
  Download,
  Globe,
  Maximize2,
  Monitor,
  Moon,
  Pin,
  Plus,
  Power,
  Send,
  SquarePen,
  STROKE,
  Sun,
  Upload,
} from "./icons";
import { MethodEditor } from "./MethodEditor";
import { Dot, Segmented, Select, Switch } from "./ui";

const TIMES = Array.from({ length: 33 }, (_, i) => {
  const mins = 6 * 60 + i * 30; // 6:00 AM → 10:00 PM
  const v = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { value: v, label: fmtTime(v) };
});

export function SettingsView({ onBack, onToast }: { onBack: () => void; onToast: (msg: string) => void }) {
  const store = useStore();
  const { state, setSettings } = store;
  const s = state.settings;
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const usage = (id: string) => state.subscriptions.filter((x) => x.methodId === id && x.status === "active").length;

  const lead = (v: LeadDays, label: string) => (
    <button
      type="button"
      className="lead-pill t-cap12m"
      aria-pressed={s.reminders.lead === v}
      onClick={() => setSettings({ reminders: { ...s.reminders, lead: v } })}
    >
      {label}
      {s.reminders.lead === v && <Check size={12} strokeWidth={2.25} />}
    </button>
  );

  const sendTest = () => {
    const next = upcoming(state)[0];
    if (next) {
      const t = buildToast(state, [next], next.nextDate, s.reminders.lead);
      void notify({ tag: t.tag, title: `Test · ${t.title}`, body: t.body, actions: t.actions });
    } else {
      void notify({ tag: "test", title: "Reminders are working", body: "You’ll get a note like this before each renewal.", actions: [] });
    }
    onToast("Test notification sent");
  };

  return (
    <>
      <div className="header header--sub">
        <button type="button" className="icon-btn icon-btn--outline" aria-label="Back" title="Back (Esc)" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={STROKE} />
        </button>
        <span className="t-title16">Settings</span>
      </div>

      <div className="widget__scroll scroll" style={{ margin: "-18px -20px -20px", padding: "18px 20px 20px", flex: "0 1 auto" }}>
        {/* General */}
        <div className="group">
          <span className="t-cap12m c-tertiary">General</span>
          <div className="card">
            <div className="setting setting--top">
              <Power size={16} strokeWidth={STROKE} />
              <div className="setting__text">
                <span className="t-body13m">Launch at startup</span>
                <span className="t-cap12 c-tertiary">Needed for reminders to arrive.</span>
              </div>
              <Switch
                label="Launch at startup"
                checked={s.launchAtStartup}
                onChange={(v) => {
                  setSettings({ launchAtStartup: v });
                  void setAutostart(v);
                }}
              />
            </div>
            <div className="setting">
              <Pin size={16} strokeWidth={STROKE} />
              <div className="setting__text">
                <span className="t-body13m">Keep on top of other windows</span>
              </div>
              <Switch
                label="Keep on top of other windows"
                checked={s.keepOnTop}
                onChange={(v) => {
                  setSettings({ keepOnTop: v });
                  void setAlwaysOnTop(v);
                }}
              />
            </div>
            <div className="setting">
              <Maximize2 size={16} strokeWidth={STROKE} />
              <div className="setting__text">
                <span className="t-body13m">Widget size</span>
              </div>
              <Select<WidgetSize>
                label="Widget size"
                value={s.size}
                onChange={(v) => setSettings({ size: v })}
                options={[
                  { value: "full", label: "Full" },
                  { value: "medium", label: "Medium" },
                  { value: "small", label: "Small" },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="group">
          <span className="t-cap12m c-tertiary">Appearance</span>
          <div className="card">
            <div className="setting setting--top">
              <div className="setting__text">
                <span className="t-body13m">Theme</span>
                <span className="t-cap12 c-tertiary">The header switch overrides this until you pick System.</span>
              </div>
            </div>
            <div className="setting__sub">
              <Segmented<ThemePref>
                className="seg--theme"
                value={s.theme}
                onChange={(v) => setSettings({ theme: v })}
                options={[
                  { value: "system", label: <><Monitor size={14} strokeWidth={STROKE} />System</> },
                  { value: "light", label: <><Sun size={14} strokeWidth={STROKE} />Light</> },
                  { value: "dark", label: <><Moon size={14} strokeWidth={STROKE} />Dark</> },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Currency */}
        <div className="group">
          <span className="t-cap12m c-tertiary">Currency</span>
          <div className="card">
            <div className="setting setting--top">
              <Globe size={16} strokeWidth={STROKE} />
              <div className="setting__text">
                <span className="t-body13m">Base currency</span>
                <span className="t-cap12 c-tertiary">One currency for everything. Changing it doesn’t convert amounts.</span>
              </div>
              <Select
                label="Base currency"
                value={s.currency}
                onChange={(v) => setSettings({ currency: v })}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>
        </div>

        {/* Reminders */}
        <div className="group">
          <span className="t-cap12m c-tertiary">Reminders</span>
          <div className="card">
            <div className="setting">
              <Bell size={16} strokeWidth={STROKE} />
              <div className="setting__text">
                <span className="t-body13m">Renewal reminders</span>
              </div>
              <Switch
                label="Renewal reminders"
                checked={s.reminders.enabled}
                onChange={(v) => setSettings({ reminders: { ...s.reminders, enabled: v } })}
              />
            </div>
            <>
              <div className={`setting${s.reminders.enabled ? "" : " disabled"}`}>
                <div className="setting__text">
                  <span className="t-body13m">Remind me</span>
                </div>
              </div>
              <div className={`setting__sub setting__sub--nowrap${s.reminders.enabled ? "" : " disabled"}`}>
                {lead(0, "On the day")}
                {lead(1, "1 day before")}
                {lead(3, "3 days before")}
              </div>
              <div className={`setting${s.reminders.enabled ? "" : " disabled"}`}>
                <Clock size={16} strokeWidth={STROKE} />
                <div className="setting__text">
                  <span className="t-body13m">Time</span>
                </div>
                <Select
                  label="Reminder time"
                  value={s.reminders.time}
                  onChange={(v) => setSettings({ reminders: { ...s.reminders, time: v } })}
                  options={TIMES}
                />
              </div>
              <button type="button" className={`setting${s.reminders.enabled ? "" : " disabled"}`} style={{ gap: 8 }} onClick={sendTest}>
                <Send size={16} strokeWidth={STROKE} />
                <span className="t-body13m link">Send a test notification</span>
              </button>
            </>
          </div>
        </div>

        {/* Payment methods */}
        <div className="group">
          <span className="t-cap12m c-tertiary">Payment methods</span>
          <div className="card">
            {state.methods.map((m: PaymentMethod) =>
              editing === m.id ? (
                <div key={m.id} className="setting" style={{ padding: 0 }}>
                  <div style={{ flex: 1 }}>
                    <MethodEditor
                      initial={m}
                      usedBy={usage(m.id)}
                      existingNames={state.methods.map((x) => x.name)}
                      onCancel={() => setEditing(null)}
                      onSave={(nm) => {
                        store.saveMethod(nm);
                        setEditing(null);
                      }}
                      onDelete={() => {
                        store.deleteMethod(m.id);
                        setEditing(null);
                        onToast(`${m.name} removed`);
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div key={m.id} className="setting setting--compact">
                  <Dot color={m.color} />
                  <div className="setting__text">
                    <span className="t-body13m ellipsis">{m.name}</span>
                  </div>
                  <span className="t-cap12 c-tertiary nowrap">
                    {usage(m.id) ? `${usage(m.id)} sub${usage(m.id) === 1 ? "" : "s"}` : "Not used"}
                  </span>
                  <button
                    type="button"
                    className="icon-btn icon-btn--ghost"
                    aria-label={`Edit ${m.name}`}
                    onClick={() => setEditing(m.id)}
                  >
                    <SquarePen size={14} strokeWidth={STROKE} />
                  </button>
                </div>
              ),
            )}
            {editing === "new" ? (
              <div className="setting" style={{ padding: 0 }}>
                <div style={{ flex: 1 }}>
                  <MethodEditor
                    existingNames={state.methods.map((x) => x.name)}
                    onCancel={() => setEditing(null)}
                    onSave={(nm) => {
                      store.saveMethod(nm);
                      setEditing(null);
                    }}
                  />
                </div>
              </div>
            ) : (
              <button type="button" className="setting" style={{ gap: 8 }} onClick={() => setEditing("new")}>
                <Plus size={16} strokeWidth={STROKE} />
                <span className="t-body13m">Add payment method</span>
              </button>
            )}
          </div>
        </div>

        {/* Backup */}
        <div className="group">
          <span className="t-cap12m c-tertiary">Backup</span>
          <div className="card">
            {pendingImport ? (
              <div className="confirm" style={{ margin: 8 }}>
                <span className="t-body14m">Replace your data with this backup?</span>
                <span className="t-cap12 c-secondary">
                  It has {pendingImport.subscriptions.length} subscription{pendingImport.subscriptions.length === 1 ? "" : "s"} and{" "}
                  {pendingImport.charges.length} past charge{pendingImport.charges.length === 1 ? "" : "s"}. What’s in the widget now will be
                  replaced. Export first if you want to keep it.
                </span>
                <div className="btn-row">
                  <button type="button" className="btn btn--sm btn--secondary" onClick={() => setPendingImport(null)}>
                    Keep current
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    onClick={() => {
                      store.replaceAll(pendingImport);
                      setPendingImport(null);
                      onToast("Backup imported");
                    }}
                  >
                    Replace
                  </button>
                </div>
              </div>
            ) : (
              <div className="setting" style={{ gap: 8, padding: 12 }}>
                <button
                  type="button"
                  className="small-btn t-cap12m"
                  onClick={async () => {
                    const ok = await exportBackup(backupJSON(state), `subscriptions-backup-${store.today}.json`);
                    if (ok) onToast("Backup saved");
                  }}
                >
                  <Download size={14} strokeWidth={STROKE} />
                  Export .json
                </button>
                <button
                  type="button"
                  className="small-btn t-cap12m"
                  onClick={async () => {
                    setImportError(null);
                    try {
                      const text = await pickBackup();
                      if (text) setPendingImport(parseState(text));
                    } catch (e) {
                      setImportError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  <Upload size={14} strokeWidth={STROKE} />
                  Import
                </button>
                <span className="t-cap12 c-tertiary" style={{ flex: 1, textAlign: "right" }}>
                  Data stays on this PC
                </span>
              </div>
            )}
            {importError && (
              <span className="t-cap12 field__error" style={{ padding: "0 12px 12px" }}>
                {importError}
              </span>
            )}
          </div>
        </div>

        <span className="t-cap12 c-tertiary">Subscriptions 1.0 · works offline, no account, no internet</span>
      </div>
    </>
  );
}
