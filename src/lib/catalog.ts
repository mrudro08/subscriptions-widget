import type { AppState, MethodColor, PaymentMethod, Settings, Tile } from "./types";

// Names only — the app ships no prices and looks nothing up online.
const PRESET_TILES: Record<string, Tile> = {
  netflix: "red",
  spotify: "green",
  "chatgpt plus": "slate",
  chatgpt: "slate",
  "figma professional": "violet",
  figma: "violet",
  "youtube premium": "orange",
  youtube: "orange",
  "icloud+": "blue",
  icloud: "blue",
  lightroom: "teal",
  notion: "gray",
  canva: "teal",
  "disney+": "blue",
  dropbox: "blue",
  duolingo: "green",
  "amazon prime": "slate",
  "apple music": "red",
  "microsoft 365": "orange",
  "xbox game pass": "green",
  "adobe creative cloud": "red",
  github: "slate",
  "google one": "blue",
};

const TILE_CYCLE: Tile[] = ["red", "green", "slate", "violet", "orange", "blue", "teal"];

export function tileFor(name: string): Tile {
  const key = name.trim().toLowerCase();
  if (!key) return "gray";
  if (PRESET_TILES[key]) return PRESET_TILES[key];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_CYCLE[h % TILE_CYCLE.length];
}

export function monogramLetter(name: string): string {
  const ch = name.trim()[0];
  return ch ? ch.toUpperCase() : "";
}

/** Shown on the empty state and as quick picks in the Add form. */
export const POPULAR = [
  "Netflix",
  "Spotify",
  "YouTube Premium",
  "iCloud+",
  "ChatGPT Plus",
  "Canva",
  "Disney+",
  "Dropbox",
  "Duolingo",
  "Notion",
  "Amazon Prime",
  "Microsoft 365",
];

export const METHOD_COLORS: MethodColor[] = ["teal", "violet", "blue", "orange", "green", "red", "gray"];

export const DEFAULT_METHODS: PaymentMethod[] = [
  { id: "m_card", name: "Card", color: "violet" },
  { id: "m_paypal", name: "PayPal", color: "blue" },
  { id: "m_bank", name: "Bank transfer", color: "gray" },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  size: "full",
  keepOnTop: false,
  launchAtStartup: true,
  currency: "USD",
  reminders: { enabled: true, lead: 1, time: "09:00" },
  chartOpen: false,
};

export function emptyState(): AppState {
  return {
    version: 1,
    subscriptions: [],
    charges: [],
    methods: DEFAULT_METHODS.map((m) => ({ ...m })),
    settings: { ...DEFAULT_SETTINGS, reminders: { ...DEFAULT_SETTINGS.reminders } },
    sentReminders: [],
  };
}
