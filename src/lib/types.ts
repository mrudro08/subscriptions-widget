/** ISO calendar date in local time, e.g. "2026-10-12". */
export type ISODate = string;

export type Cycle = "monthly" | "yearly";

/** Monogram tile colours (tile/*-bg + tile/*-fg tokens). */
export type Tile = "red" | "green" | "slate" | "violet" | "orange" | "blue" | "teal" | "gray";

/** Payment-method dot colours. */
export type MethodColor = "teal" | "violet" | "blue" | "gray" | "orange" | "green" | "red";

export interface PaymentMethod {
  id: string;
  name: string;
  color: MethodColor;
}

export interface Subscription {
  id: string;
  name: string;
  /** Amount per charge in minor units (cents). */
  amount: number;
  cycle: Cycle;
  /** Next renewal date. Rolls forward automatically. */
  nextDate: ISODate;
  /** Day of month the plan renews on (kept so Jan 31 → Feb 28 → Mar 31). */
  anchorDay: number;
  methodId: string;
  tile: Tile;
  status: "active" | "cancelled";
  createdAt: ISODate;
  cancelledAt?: ISODate;
  /** Last date a charge was recorded by roll-forward (shown for 3 days). */
  lastChargedAt?: ISODate;
}

export interface Charge {
  id: string;
  subId: string;
  date: ISODate;
  amount: number;
  methodId: string;
}

export type ThemePref = "system" | "light" | "dark";
export type WidgetSize = "full" | "medium" | "small";
export type LeadDays = 0 | 1 | 3;

export interface Settings {
  theme: ThemePref;
  size: WidgetSize;
  keepOnTop: boolean;
  launchAtStartup: boolean;
  currency: string;
  reminders: { enabled: boolean; lead: LeadDays; time: string /* "09:00" */ };
  chartOpen: boolean;
  /** Top-left of the widget on screen (logical px), remembered between launches. */
  position?: { x: number; y: number };
  /** The "still running in the tray" tip is shown once, the first time the widget is hidden. */
  seenHideHint?: boolean;
}

export interface AppState {
  version: 1;
  subscriptions: Subscription[];
  charges: Charge[];
  methods: PaymentMethod[];
  settings: Settings;
  /** Reminder keys already delivered ("subId:dueDate"). */
  sentReminders: string[];
}
