//! Native shell for the Subscriptions widget.
//!
//! Everything here is local: data lives in one JSON file in the user's app-data
//! folder, reminders are Windows toast notifications raised by this process, and
//! there is no network code anywhere in the app.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const DATA_FILE: &str = "subscriptions.json";
const MAIN: &str = "main";

fn data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(DATA_FILE))
}

/// Returns the saved state, or null on first run.
#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_path(&app)?;
    if !path.exists() {
        // Fall back to the last good copy if the main file went missing mid-write.
        let bak = path.with_extension("json.bak");
        if bak.exists() {
            return fs::read_to_string(bak).map(Some).map_err(|e| e.to_string());
        }
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

/// Writes atomically: temp file, keep the previous version as .bak, then rename.
#[tauri::command]
fn save_state(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("invalid state: {e}"))?;
    let path = data_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = fs::copy(&path, path.with_extension("json.bak"));
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Export / import go to a path the user picked in the system file dialog.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err("That file is too large to be a Subscriptions backup.".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[cfg_attr(not(windows), allow(dead_code))]
struct ToastAction {
    id: String,
    label: String,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(not(windows), allow(dead_code))]
struct ToastArgs {
    /// Echoed back to the UI when the user clicks the toast or one of its buttons.
    tag: String,
    title: String,
    body: String,
    #[serde(default)]
    actions: Vec<ToastAction>,
}

#[derive(Clone, Serialize)]
#[cfg_attr(not(windows), allow(dead_code))]
struct ToastActivated {
    tag: String,
    /// "open" when the body was clicked, otherwise the button id.
    action: String,
}

#[tauri::command]
fn notify(app: AppHandle, args: ToastArgs) -> Result<(), String> {
    show_toast(&app, args)
}

#[cfg(windows)]
fn show_toast(app: &AppHandle, args: ToastArgs) -> Result<(), String> {
    use tauri_winrt_notification::Toast;
    // Installed builds are registered under the bundle identifier by the
    // installer's Start-menu shortcut. Dev builds borrow PowerShell's ID.
    let app_id = if tauri::is_dev() {
        Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    };
    let mut toast = Toast::new(&app_id).title(&args.title).text1(&args.body);
    for a in &args.actions {
        toast = toast.add_button(&a.label, &a.id);
    }
    let handle = app.clone();
    let tag = args.tag.clone();
    toast
        .on_activated(move |action| {
            let action = action.unwrap_or_else(|| "open".into());
            show_main(&handle);
            let _ = handle.emit("toast-activated", ToastActivated { tag: tag.clone(), action });
            Ok(())
        })
        .show()
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn show_toast(_app: &AppHandle, args: ToastArgs) -> Result<(), String> {
    println!("[notify] {} — {} ({:?})", args.title, args.body, args.actions);
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / hide widget", true, Some("Ctrl+Alt+S"))?;
    let add = MenuItem::with_id(app, "add", "Add subscription", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&toggle, &sep, &add, &settings, &sep2, &quit])?;

    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Subscriptions")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_main(app),
            "add" => {
                show_main(app);
                let _ = app.emit("tray-action", "add");
            }
            "settings" => {
                show_main(app);
                let _ = app.emit("tray-action", "settings");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let hide_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyS);

    tauri::Builder::default()
        // A second launch (e.g. from the Start menu) just brings the widget back.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &hide_shortcut && event.state() == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            build_tray(app)?;
            // Another app may already own Ctrl+Alt+S; the tray still works then.
            if let Err(e) = app.global_shortcut().register(hide_shortcut) {
                eprintln!("could not register Ctrl+Alt+S: {e}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Alt+F4 hides the widget instead of quitting, so reminders keep working.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            write_text_file,
            read_text_file,
            notify,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running Subscriptions");
}
