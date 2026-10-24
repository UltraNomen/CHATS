//! CHATS for Mac, Windows and Android: the regular chat app (built into `build/client`) in a native window.
//!
//! - Desktop: closing the window hides CHATS to the tray / menu bar, where the app keeps syncing and shows native
//!   notifications with the decrypted preview. The tray menu offers "Start at login". A second launch focuses it.
//! - Android: while the app is in the background, the `chats-watch` plugin asks the user's own server for new
//!   messages, so notifications work without Google's push service.
use tauri::Manager;
use tauri_plugin_notification::{NotificationExt, PermissionState};

/// Shows a system notification. The web app decides when, and what it says.
#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
  app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}

/// Asks for notification permission where the system has one (Android 13+, macOS). Returns whether it's granted.
#[tauri::command]
fn notify_permission(app: tauri::AppHandle) -> bool {
  let n = app.notification();
  match n.permission_state() {
    Ok(PermissionState::Granted) => true,
    _ => matches!(n.request_permission(), Ok(PermissionState::Granted)),
  }
}

#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

#[cfg(desktop)]
fn tray(app: &tauri::App) -> tauri::Result<()> {
  use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
  use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
  use tauri_plugin_autostart::ManagerExt;

  let open = MenuItem::with_id(app, "open", "Open CHATS", true, None::<&str>)?;
  let login_on = app.autolaunch().is_enabled().unwrap_or(false);
  let login = CheckMenuItem::with_id(app, "login", "Start at login", true, login_on, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Quit CHATS", true, None::<&str>)?;
  let sep = PredefinedMenuItem::separator(app)?;
  let menu = Menu::with_items(app, &[&open, &login, &sep, &quit])?;

  let mut builder = TrayIconBuilder::with_id("main")
    .tooltip("CHATS")
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id.as_ref() {
      "open" => show_main(app),
      "login" => {
        let auto = app.autolaunch();
        let _ = if auto.is_enabled().unwrap_or(false) { auto.disable() } else { auto.enable() };
      }
      "quit" => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
        show_main(tray.app_handle());
      }
    });
  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }
  builder.build(app)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      Some(vec!["--hidden"]),
    ));

  builder
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_chats_watch::init())
    .invoke_handler(tauri::generate_handler![notify, notify_permission])
    .setup(|app| {
      #[cfg(desktop)]
      {
        tray(app)?;
        // Started at login: stay in the tray until the user opens the window.
        if std::env::args().any(|a| a == "--hidden") {
          if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
          }
        }
      }
      #[cfg(mobile)]
      let _ = app;
      Ok(())
    })
    .on_window_event(|window, event| {
      // Closing the window keeps CHATS running in the tray; "Quit CHATS" in the tray menu exits.
      #[cfg(desktop)]
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
      }
      #[cfg(mobile)]
      let _ = (window, event);
    })
    .build(tauri::generate_context!())
    .expect("error while building CHATS")
    .run(|app, event| {
      // macOS: clicking the Dock icon brings the hidden window back.
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Reopen { .. } = event {
        show_main(app);
      }
      #[cfg(not(target_os = "macos"))]
      let _ = (app, event);
    });
}
