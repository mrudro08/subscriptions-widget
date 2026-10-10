# Subscriptions — desktop widget for Windows

A small always-available widget that tracks your subscriptions and reminds you
before they renew. Built from the Figma file *Dribble → Subscription tracker · v2*.

**It is fully offline.** No account, no sync, no analytics, no update checks.
Nothing in the app opens a network connection:

- Data lives in one file on this PC: `%APPDATA%\com.spectra.subscriptions\subscriptions.json` (plus a `.bak` of the previous save).
- The window's Content-Security-Policy only allows the app's own files (`connect-src` is limited to Tauri's local IPC).
- The Rust side has no HTTP client, shell or filesystem plugin; the only file access is that data file and the backup file you pick in Export / Import.
- Fonts (Inter) and icons (Lucide) are bundled. No prices or logos are looked up; platform tiles are letter monograms.

## Build the Windows installer

### Option A: GitHub Actions (no tools on your PC)

1. Push this folder to a GitHub repository (it can be private).
2. Open **Actions → Build Windows installer → Run workflow**.
3. When it finishes, download **Subscriptions-windows-installer** from the run's *Artifacts* and run `Subscriptions_1.0.0_x64-setup.exe`.

### Option B: on a Windows PC

Install once: [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs) and the *Desktop development with C++* workload from the Visual Studio Build Tools.

```powershell
npm install
npm test             # renewal maths (36 checks against the Figma numbers)
npm run tauri dev    # run the widget while developing
npm run tauri build  # → src-tauri\target\release\bundle\nsis\Subscriptions_1.0.0_x64-setup.exe
```

The installer is per-user (no admin prompt). On Windows 10 PCs without the WebView2 runtime, the installer fetches it from Microsoft once during setup. Windows 11 already has it.

### Preview in a browser

`npm run dev`, then open `http://localhost:1420/?demo` for the Figma sample data (today = Oct 10, 2026).
Add `&theme=dark`, `&size=medium`, `&size=small`, `&chart` or `&empty` to see other states. The demo never saves anything.

## How it behaves

| | |
|---|---|
| Sizes | Full (360 wide, max 720 tall or the screen height − 48), Medium 360×170, Small 170×170. Click a compact widget to open Full as a flyout; it closes when you click elsewhere. |
| Moving | Drag any empty area. The position is remembered. If a monitor is unplugged, the widget comes back to the top-right corner. |
| Menu | ⋯ in the header, or right-click an empty area: size, Settings (Ctrl+,), Keep on top, Hide (Ctrl+Alt+S), Quit. |
| Tray | Left-click shows or hides the widget. Right-click: Add subscription, Settings, Quit. Closing the window (Alt+F4) only hides it. |
| Keyboard | Ctrl+N add · Tab into the list · ↑ ↓ move · Enter edit · Shift+F10 / Menu key row menu · Del delete · Esc back/close. |
| Reminders | Windows notifications at the set time (default 9:00 AM, 1 day before). Same-day renewals merge into one. If the PC was off at that time, the reminder goes out at the next launch that day. **Open** jumps to the row; **Mark as cancelled** opens the in-widget confirm and never cancels silently. |
| Renewals | After midnight past a renewal date, the charge is recorded and the date moves one cycle (Jan 31 → Feb 28 → Mar 31; Feb 29 → Feb 28 on yearly plans). If the app was closed, every missed renewal is caught up on launch. Cancelled plans don't roll. |

All numbers follow the "Definitions for developers" table in Figma; see `src/lib/rules.ts` and its tests.

## Small flows added beyond the Figma file

These reuse the existing components and tokens:

- **Payment method editor**: the "Other" chip in the form and *Add payment method* / ✎ in Settings open an inline editor (name + colour dot). A method that subscriptions still use can't be deleted until they're moved.
- **Delete from the list**: Del or *row menu → Delete* shows the 7b confirm inline in the list. Edit's footer also has it.
- **Cancelled rows**: Restore button plus a ⋯ menu (Edit, Restore, Delete). Restoring skips renewals that passed while cancelled.
- **Paying since (optional)** in Add: fills in past payments, so a new user's chart isn't empty. Months before tracking began show as faint bars and are left out of the average.
- **Import confirm**: shows what the backup contains before replacing anything.
- **Toasts** for add / restore / delete / backup, plus *Undo* on cancel, in the Figma toast style.
- **First hide**: a one-time Windows notification explains that the app is still running and how to bring it back.
- **Compact empty states** for Medium and Small.

## Project layout

```
src/lib/rules.ts         every number the widget shows (tested in rules.test.ts)
src/lib/store.tsx        state, saving, the midnight clock and roll-forward
src/lib/platform.ts      bridge to the native shell (window, tray, notifications, files)
src/components/*         UI, one file per Figma screen/component
src/styles/tokens.css    Figma variables (Light + Dark)
src-tauri/src/lib.rs     native shell: tray, Ctrl+Alt+S, toasts, atomic saves
```
